import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { WorkflowRunOrchestratorService } from '@application/services/workflow/WorkflowRunOrchestratorService';
import { WorkflowStepPolicyService } from '@application/services/workflow/WorkflowStepPolicyService';
import { WorkflowStepRunnerService } from '@application/services/workflow/WorkflowStepRunnerService';
import { WorkflowStepGovernanceService } from '@application/services/workflow/WorkflowStepGovernanceService';
import { PlatformCapabilityNegotiationService } from '@application/services/platform/PlatformCapabilityNegotiationService';
import { ExecutionController } from '@application/controllers/ExecutionController';
import type { WorkflowDefinition } from '@domain/entities/Workflow';

describe('Workflow execution integration', () => {
    it('executes workflow through facade with atomic terminal transition on governance block', async () => {
        const definition: WorkflowDefinition = {
            id: 'wf-1',
            name: 'Workflow',
            status: 'draft',
            version: 1,
            platformConfig: { platform: 'web', url: 'https://example.com' },
            steps: [
                {
                    id: 's1',
                    name: 'Blocked Step',
                    prompt: 'blocked',
                    continueOnFailure: false
                }
            ],
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z'
        };

        const persistence = {
            getWorkflowDefinition: vi.fn(() => okAsync(definition)),
            saveWorkflowRun: vi.fn(() => okAsync(undefined)),
            updateWorkflowRun: vi.fn(() => okAsync(undefined)),
            saveWorkflowStepRun: vi.fn(() => okAsync(undefined)),
            updateWorkflowStepRun: vi.fn(() => okAsync(undefined)),
            commitAtomicWorkflowTransition: vi.fn(() => okAsync(undefined))
        };

        const stepRunner = new WorkflowStepRunnerService({
            execute: vi.fn(async function* () {
                yield { type: 'started' as const, testRunId: 'run-1' };
                yield { type: 'completed' as const, success: true, summary: 'ok' };
            })
        } as unknown as never, {
            createSession: vi.fn(async () => ({
                executionUrl: 'https://example.com',
                shouldNavigate: true,
                browser: {},
                dispose: vi.fn(async () => undefined)
            }))
        } as unknown as never);

        const governance = new WorkflowStepGovernanceService(
            {
                assess: vi.fn().mockReturnValue({ blocked: true, mode: 'soft-enforce' })
            } as unknown as never,
            { get: vi.fn().mockReturnValue(null) } as unknown as never,
            { isAllowed: vi.fn().mockReturnValue(true) } as unknown as never,
            { get: vi.fn().mockReturnValue(null) } as unknown as never,
            { invoke: vi.fn().mockReturnValue({ success: true, message: 'ok' }) } as unknown as never
        );

        const orchestrator = new WorkflowRunOrchestratorService(
            persistence as unknown as never,
            { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as never,
            new WorkflowStepPolicyService(),
            governance,
            stepRunner,
            new PlatformCapabilityNegotiationService()
        );
        const controller = new ExecutionController();
        controller.start();

        const eventTypes: string[] = [];
        for await (const event of orchestrator.executeWorkflow('wf-1', controller)) {
            eventTypes.push(event.type);
        }

        expect(eventTypes).toEqual(['workflow_started', 'workflow_step_started', 'workflow_step_completed', 'workflow_failed']);
        expect(persistence.commitAtomicWorkflowTransition).toHaveBeenCalledOnce();
        expect(persistence.updateWorkflowRun).not.toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: 'failed' }));
    });
});
