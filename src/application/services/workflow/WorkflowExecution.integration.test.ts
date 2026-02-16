import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { WorkflowRunOrchestratorService } from './WorkflowRunOrchestratorService';
import { WorkflowExecutionService } from './WorkflowExecutionService';
import { WorkflowStepPolicyService } from './WorkflowStepPolicyService';
import { WorkflowStepRunnerService } from './WorkflowStepRunnerService';
import { WorkflowStepGovernanceService } from './WorkflowStepGovernanceService';
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
        } as any, {
            createSession: vi.fn(async () => ({
                executionUrl: 'https://example.com',
                shouldNavigate: true,
                browser: {},
                dispose: vi.fn(async () => undefined)
            }))
        } as any);

        const governance = new WorkflowStepGovernanceService(
            {
                assess: vi.fn().mockReturnValue({ blocked: true, mode: 'soft-enforce' })
            } as any,
            { get: vi.fn().mockReturnValue(null) } as any,
            { isAllowed: vi.fn().mockReturnValue(true) } as any,
            { get: vi.fn().mockReturnValue(null) } as any,
            { invoke: vi.fn().mockReturnValue({ success: true, message: 'ok' }) } as any
        );

        const orchestrator = new WorkflowRunOrchestratorService(
            persistence as any,
            { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
            new WorkflowStepPolicyService(),
            governance,
            stepRunner
        );
        const executionService = new WorkflowExecutionService(orchestrator);

        const controller = new ExecutionController();
        controller.start();

        const eventTypes: string[] = [];
        for await (const event of executionService.executeWorkflow('wf-1', controller)) {
            eventTypes.push(event.type);
        }

        expect(eventTypes).toEqual(['workflow_started', 'workflow_step_started', 'workflow_step_completed', 'workflow_failed']);
        expect(persistence.commitAtomicWorkflowTransition).toHaveBeenCalledOnce();
        expect(persistence.updateWorkflowRun).not.toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ status: 'failed' }));
    });
});
