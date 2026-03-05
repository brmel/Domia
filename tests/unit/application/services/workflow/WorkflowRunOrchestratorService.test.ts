import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { WorkflowRunOrchestratorService } from '@application/services/workflow/WorkflowRunOrchestratorService';
import { ExecutionController } from '@application/controllers/ExecutionController';
import type { WorkflowDefinition } from '@domain/entities/Workflow';
import { RunState } from '@domain/enums/RunState';
import { WorkflowStepPolicyService } from '@application/services/workflow/WorkflowStepPolicyService';
import { PlatformCapabilityNegotiationService } from '@application/services/platform/PlatformCapabilityNegotiationService';
import { createMockLogger } from '../../../../helpers/createMockLogger';

describe('WorkflowRunOrchestratorService', () => {
    const definition: WorkflowDefinition = {
        id: 'wf-1',
        name: 'Smoke Workflow',
        status: 'draft',
        version: 1,
        platformConfig: { platform: 'web', url: 'https://example.com' },
        steps: [
            {
                id: 'step-1',
                name: 'Validate title',
                prompt: 'check page title',
                continueOnFailure: false
            }
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
    };

    const createService = (options?: {
        governanceAllowed?: boolean;
        stepResult?: { success: boolean; summary?: string; runId?: string };
    }): {
        service: WorkflowRunOrchestratorService;
        persistence: {
            getWorkflowDefinition: ReturnType<typeof vi.fn>;
            saveWorkflowRun: ReturnType<typeof vi.fn>;
            updateWorkflowRun: ReturnType<typeof vi.fn>;
            saveWorkflowStepRun: ReturnType<typeof vi.fn>;
            updateWorkflowStepRun: ReturnType<typeof vi.fn>;
            commitAtomicWorkflowTransition: ReturnType<typeof vi.fn>;
        };
    } => {
        const persistence = {
            getWorkflowDefinition: vi.fn(() => okAsync(definition)),
            saveWorkflowRun: vi.fn(() => okAsync(undefined)),
            updateWorkflowRun: vi.fn(() => okAsync(undefined)),
            saveWorkflowStepRun: vi.fn(() => okAsync(undefined)),
            updateWorkflowStepRun: vi.fn(() => okAsync(undefined)),
            commitAtomicWorkflowTransition: vi.fn(() => okAsync(undefined))
        };

        const service = new WorkflowRunOrchestratorService(
            persistence as unknown as never,
            createMockLogger(),
            new WorkflowStepPolicyService(),
            {
                assess: vi.fn().mockReturnValue(
                    options?.governanceAllowed === false
                        ? { allowed: false, reason: 'blocked by policy' }
                        : { allowed: true }
                )
            } as unknown as never,
            {
                openSharedSession: vi.fn().mockResolvedValue({
                    executionUrl: 'https://example.com',
                    shouldNavigate: true,
                    automation: {},
                    dispose: vi.fn().mockResolvedValue(undefined)
                }),
                runStep: vi.fn().mockResolvedValue(options?.stepResult ?? { success: true, summary: 'step ok', runId: 'run-1' })
            } as unknown as never,
            new PlatformCapabilityNegotiationService()
        );

        return { service, persistence };
    };

    it('executes workflow steps and emits lifecycle events', async () => {
        const { service, persistence } = createService();

        const controller = new ExecutionController();
        controller.start();

        const events: string[] = [];
        for await (const event of service.executeWorkflow('wf-1', controller)) {
            events.push(event.type);
        }

        expect(events).toEqual([
            'workflow_started',
            'workflow_step_started',
            'workflow_step_bound',
            'workflow_step_completed',
            'workflow_completed'
        ]);
        expect(persistence.saveWorkflowRun).toHaveBeenCalledOnce();
        expect(persistence.saveWorkflowStepRun).toHaveBeenCalledOnce();
        expect(persistence.updateWorkflowRun).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ status: 'completed' })
        );
    });

    it('marks workflow cancelled when controller is stopped before step execution', async () => {
        const { service, persistence } = createService();

        const controller = new ExecutionController();
        controller.start();
        controller.stop();

        const events: string[] = [];
        for await (const event of service.executeWorkflow('wf-1', controller)) {
            events.push(event.type);
        }

        expect(controller.state).toBe(RunState.CANCELLED);
        expect(events).toContain('workflow_completed');
        expect(persistence.updateWorkflowRun).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ status: 'cancelled' })
        );
    });

    it('fails workflow when step requires unsupported platform capability', async () => {
        const capabilityBlockedDefinition: WorkflowDefinition = {
            ...definition,
            steps: [
                {
                    id: 'step-capability',
                    name: 'Control app menu',
                    prompt: 'open menu bar and quit app',
                    continueOnFailure: false
                }
            ]
        };

        const persistence = {
            getWorkflowDefinition: vi.fn(() => okAsync(capabilityBlockedDefinition)),
            saveWorkflowRun: vi.fn(() => okAsync(undefined)),
            updateWorkflowRun: vi.fn(() => okAsync(undefined)),
            saveWorkflowStepRun: vi.fn(() => okAsync(undefined)),
            updateWorkflowStepRun: vi.fn(() => okAsync(undefined)),
            commitAtomicWorkflowTransition: vi.fn(() => okAsync(undefined))
        };

        const runStep = vi.fn().mockResolvedValue({ success: true, summary: 'step ok', runId: 'run-1' });

        const service = new WorkflowRunOrchestratorService(
            persistence as unknown as never,
            createMockLogger(),
            new WorkflowStepPolicyService(),
            {
                assess: vi.fn().mockReturnValue({ allowed: true })
            } as unknown as never,
            {
                openSharedSession: vi.fn().mockResolvedValue({
                    executionUrl: 'https://example.com',
                    shouldNavigate: true,
                    automation: {},
                    dispose: vi.fn().mockResolvedValue(undefined)
                }),
                runStep
            } as unknown as never,
            new PlatformCapabilityNegotiationService()
        );

        const controller = new ExecutionController();
        controller.start();

        const events: string[] = [];
        for await (const event of service.executeWorkflow('wf-1', controller)) {
            events.push(event.type);
        }

        expect(runStep).not.toHaveBeenCalled();
        expect(events).toContain('workflow_failed');
        expect(persistence.commitAtomicWorkflowTransition).toHaveBeenCalledOnce();
    });

});
