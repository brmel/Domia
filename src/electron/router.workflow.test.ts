import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { container } from '../composition-root';
import { appRouter } from '../../electron/router';
import { WorkflowDefinitionService } from '../application/services/workflow/WorkflowDefinitionService';
import { WorkflowExecutionService } from '../application/services/workflow/WorkflowExecutionService';

describe('workflow router', () => {
    beforeEach(() => {
        container.clearInstances();
    });

    it('returns workflow run details from persistence adapter', async () => {
        container.registerInstance('IPersistenceAdapter', {
            getWorkflowRun: vi.fn(() => okAsync({
                id: 'wr-1',
                workflowDefinitionId: 'wf-1',
                workflowVersion: 1,
                status: 'running',
                startedAt: '2026-01-01T00:00:00.000Z'
            })),
            getWorkflowStepRuns: vi.fn(() => okAsync([
                {
                    id: 'wsr-1',
                    workflowRunId: 'wr-1',
                    stepId: 's1',
                    stepIndex: 0,
                    status: 'completed',
                    startedAt: '2026-01-01T00:00:00.000Z'
                }
            ])),
            getWorkflowDefinitions: vi.fn(() => okAsync([])),
            getWorkflowRuns: vi.fn(() => okAsync([])),
            getWorkflowDefinition: vi.fn(() => okAsync(null))
        } as unknown as never);

        const caller = appRouter.createCaller({} as unknown as never);
        const details = await caller.workflow.getRunDetails({ workflowRunId: 'wr-1' });

        expect(details?.run.id).toBe('wr-1');
        expect(details?.stepRuns).toHaveLength(1);
    });

    it('delegates lifecycle routes to definition service', async () => {
        const definitionService = {
            createDraft: vi.fn(async () => ({ id: 'wf-created' })),
            updateDraft: vi.fn(async () => ({ id: 'wf-updated', status: 'draft' })),
            publishDraft: vi.fn(async () => ({ id: 'wf-updated', status: 'published' })),
            createNextDraftVersion: vi.fn(async () => ({ id: 'wf-v2', version: 2 }))
        };

        container.registerInstance(WorkflowDefinitionService, definitionService as unknown as never);
        container.registerInstance('IPersistenceAdapter', {
            getWorkflowDefinitions: vi.fn(() => okAsync([])),
            getWorkflowRuns: vi.fn(() => okAsync([])),
            getWorkflowStepRuns: vi.fn(() => okAsync([])),
            getWorkflowRun: vi.fn(() => okAsync(null)),
            getWorkflowDefinition: vi.fn(() => okAsync(null))
        } as unknown as never);

        const caller = appRouter.createCaller({} as unknown as never);

        const created = await caller.workflow.create({
            name: 'WF',
            platformConfig: { platform: 'web', url: 'https://example.com' },
            steps: [{ name: 'Step 1', prompt: 'Do it', continueOnFailure: false }]
        });
        expect(created.id).toBe('wf-created');

        await caller.workflow.update({
            id: 'wf-created',
            name: 'WF Updated',
            steps: [{ id: 's1', name: 'Step 1', prompt: 'Do it now', continueOnFailure: false }]
        });

        await caller.workflow.publish({ workflowDefinitionId: 'wf-created' });
        await caller.workflow.createNextVersion({ sourceWorkflowDefinitionId: 'wf-created' });

        expect(definitionService.createDraft).toHaveBeenCalledOnce();
        expect(definitionService.updateDraft).toHaveBeenCalledOnce();
        expect(definitionService.publishDraft).toHaveBeenCalledOnce();
        expect(definitionService.createNextDraftVersion).toHaveBeenCalledOnce();
    });

    it('starts and cancels workflow execution', async () => {
        container.registerInstance('IPersistenceAdapter', {
            getWorkflowDefinitions: vi.fn(() => okAsync([])),
            getWorkflowRuns: vi.fn(() => okAsync([])),
            getWorkflowStepRuns: vi.fn(() => okAsync([])),
            getWorkflowRun: vi.fn(() => okAsync(null)),
            getWorkflowDefinition: vi.fn(() => okAsync(null))
        } as unknown as never);

        container.registerInstance(WorkflowExecutionService, {
            executeWorkflow: vi.fn(async function* () {
                yield { type: 'workflow_started', workflowRunId: 'wr-1', workflowDefinitionId: 'wf-1' };
                await new Promise((resolve) => setTimeout(resolve, 50));
                yield { type: 'workflow_completed', workflowRunId: 'wr-1', success: true };
            })
        } as unknown as never);

        const caller = appRouter.createCaller({} as unknown as never);
        const startResult = await caller.workflow.start({ workflowDefinitionId: 'wf-1' });
        expect(startResult.success).toBe(true);

        const cancelResult = await caller.workflow.cancel();
        expect(cancelResult.success).toBe(true);
    });

    it('returns false when cancelling without active workflow', async () => {
        const caller = appRouter.createCaller({} as unknown as never);
        await caller.workflow.cancel();
        const cancelResult = await caller.workflow.cancel();
        expect(cancelResult.success).toBe(false);
    });

    it('supersedes previous workflow start when start is called twice', async () => {
        container.registerInstance('IPersistenceAdapter', {
            getWorkflowDefinitions: vi.fn(() => okAsync([])),
            getWorkflowRuns: vi.fn(() => okAsync([])),
            getWorkflowStepRuns: vi.fn(() => okAsync([])),
            getWorkflowRun: vi.fn(() => okAsync(null)),
            getWorkflowDefinition: vi.fn(() => okAsync(null))
        } as unknown as never);

        const executeWorkflow = vi
            .fn()
            .mockImplementationOnce(async function* () {
                yield { type: 'workflow_started', workflowRunId: 'wr-1', workflowDefinitionId: 'wf-1' };
                await new Promise((resolve) => setTimeout(resolve, 100));
                yield { type: 'workflow_completed', workflowRunId: 'wr-1', success: true };
            })
            .mockImplementationOnce(async function* () {
                yield { type: 'workflow_started', workflowRunId: 'wr-2', workflowDefinitionId: 'wf-2' };
                yield { type: 'workflow_completed', workflowRunId: 'wr-2', success: true };
            });

        container.registerInstance(WorkflowExecutionService, {
            executeWorkflow
        } as unknown as never);

        const caller = appRouter.createCaller({} as unknown as never);
        const firstStart = await caller.workflow.start({ workflowDefinitionId: 'wf-1' });
        const secondStart = await caller.workflow.start({ workflowDefinitionId: 'wf-2' });

        expect(firstStart.success).toBe(true);
        expect(secondStart.success).toBe(true);
        expect(executeWorkflow).toHaveBeenCalledTimes(2);
        expect(executeWorkflow.mock.calls[0]?.[0]).toBe('wf-1');
        expect(executeWorkflow.mock.calls[1]?.[0]).toBe('wf-2');
    });
});
