import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { WorkflowRunOrchestratorService } from './WorkflowRunOrchestratorService';
import { ExecutionController } from '@application/controllers/ExecutionController';
import type { WorkflowDefinition } from '@domain/entities/Workflow';
import { TestRunState } from '@domain/enums/TestRunState';
import { WorkflowStepPolicyService } from './WorkflowStepPolicyService';

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
        stepResult?: { success: boolean; summary?: string; testRunId?: string };
    }) => {
        const persistence = {
            getWorkflowDefinition: vi.fn(() => okAsync(definition)),
            saveWorkflowRun: vi.fn(() => okAsync(undefined)),
            updateWorkflowRun: vi.fn(() => okAsync(undefined)),
            saveWorkflowStepRun: vi.fn(() => okAsync(undefined)),
            updateWorkflowStepRun: vi.fn(() => okAsync(undefined)),
            commitAtomicWorkflowTransition: vi.fn(() => okAsync(undefined))
        };

        const service = new WorkflowRunOrchestratorService(
            persistence as any,
            { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
            new WorkflowStepPolicyService(),
            {
                assess: vi.fn().mockReturnValue(
                    options?.governanceAllowed === false
                        ? { allowed: false, reason: 'blocked by policy' }
                        : { allowed: true }
                )
            } as any,
            { runStep: vi.fn().mockResolvedValue(options?.stepResult ?? { success: true, summary: 'step ok', testRunId: 'run-1' }) } as any
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

        expect(controller.state).toBe(TestRunState.CANCELLED);
        expect(events).toContain('workflow_completed');
        expect(persistence.updateWorkflowRun).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ status: 'cancelled' })
        );
    });

});
