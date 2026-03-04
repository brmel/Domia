import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { container } from '../../../src/composition-root';
import { appRouter } from '../../../electron/router';
import { WorkflowRunOrchestratorService } from '@application/services/workflow/WorkflowRunOrchestratorService';
import type { WorkflowDefinition, WorkflowRunRecord, WorkflowStepRunRecord } from '@domain/entities/Workflow';

function createInMemoryPersistence() {
    const definitions = new Map<string, WorkflowDefinition>();
    const runs = new Map<string, WorkflowRunRecord>();
    const stepRuns: WorkflowStepRunRecord[] = [];

    return {
        saveWorkflowDefinition: vi.fn((def: WorkflowDefinition) => { definitions.set(def.id, { ...def }); return okAsync(undefined as void); }),
        getWorkflowDefinition: vi.fn((id: string) => okAsync(definitions.get(id) ?? null)),
        getWorkflowDefinitions: vi.fn((limit?: number) => okAsync([...definitions.values()].slice(0, limit ?? 100))),
        saveWorkflowRun: vi.fn((run: WorkflowRunRecord) => { runs.set(run.id, run); return okAsync(undefined as void); }),
        updateWorkflowRun: vi.fn((id: string, updates: Partial<WorkflowRunRecord>) => { const r = runs.get(id); if (r) runs.set(id, { ...r, ...updates }); return okAsync(undefined as void); }),
        getWorkflowRun: vi.fn((id: string) => okAsync(runs.get(id) ?? null)),
        getWorkflowRuns: vi.fn((limit?: number) => okAsync([...runs.values()].slice(0, limit ?? 100))),
        saveWorkflowStepRun: vi.fn((sr: WorkflowStepRunRecord) => { stepRuns.push(sr); return okAsync(undefined as void); }),
        updateWorkflowStepRun: vi.fn(() => okAsync(undefined as void)),
        getWorkflowStepRuns: vi.fn((wId: string) => okAsync(stepRuns.filter(s => s.workflowRunId === wId))),
        commitAtomicWorkflowTransition: vi.fn(() => okAsync(undefined as void)),
        getRuns: vi.fn(() => okAsync([])),
        getRun: vi.fn(() => okAsync(null)),
        getSteps: vi.fn(() => okAsync([])),
        saveRun: vi.fn(() => okAsync(undefined as void)),
        saveStep: vi.fn(() => okAsync(undefined as void)),
        updateRunStatus: vi.fn(() => okAsync(undefined as void)),
        clearHistory: vi.fn(() => okAsync(undefined as void)),
        saveCheckpoint: vi.fn(() => okAsync(undefined as void)),
        getCheckpointRecords: vi.fn(() => okAsync([])),
        saveReplayIdempotencyKey: vi.fn(() => okAsync(undefined as void)),
        hasReplayIdempotencyKey: vi.fn(() => okAsync(false)),
    };
}

describe('workflow router', () => {
    beforeEach(() => {
        container.clearInstances();
    });

    it('returns workflow run details from persistence adapter', async () => {
        const persistence = createInMemoryPersistence();
        persistence.getWorkflowRun.mockReturnValueOnce(okAsync({
            id: 'wr-1',
            workflowDefinitionId: 'wf-1',
            workflowVersion: 1,
            status: 'running',
            startedAt: '2026-01-01T00:00:00.000Z'
        } as WorkflowRunRecord));
        persistence.getWorkflowStepRuns.mockReturnValueOnce(okAsync([
            {
                id: 'wsr-1',
                workflowRunId: 'wr-1',
                stepId: 's1',
                stepIndex: 0,
                status: 'completed',
                startedAt: '2026-01-01T00:00:00.000Z'
            }
        ] as WorkflowStepRunRecord[]));

        container.registerInstance('IPersistenceAdapter', persistence as never);
        container.registerInstance('IWorkflowRepository', persistence as never);
        container.registerInstance('ILogger', { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never);

        const caller = appRouter.createCaller({} as never);
        const details = await caller.workflow.getRunDetails({ workflowRunId: 'wr-1' });

        expect(details?.run.id).toBe('wr-1');
        expect(details?.stepRuns).toHaveLength(1);
    });

    it('creates, updates, publishes, and versions via real WorkflowDefinitionService', async () => {
        const persistence = createInMemoryPersistence();
        container.registerInstance('IPersistenceAdapter', persistence as never);
        container.registerInstance('IWorkflowRepository', persistence as never);
        container.registerInstance('ILogger', { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never);

        const caller = appRouter.createCaller({} as never);

        const created = await caller.workflow.create({
            name: 'WF',
            platformConfig: { platform: 'web', url: 'https://example.com' },
            steps: [{ name: 'Step 1', prompt: 'Do it', continueOnFailure: false }]
        });
        expect(created.id).toBeDefined();
        expect(persistence.saveWorkflowDefinition).toHaveBeenCalledOnce();

        const savedDef = persistence.saveWorkflowDefinition.mock.calls[0]![0] as WorkflowDefinition;
        expect(savedDef.name).toBe('WF');
        expect(savedDef.status).toBe('draft');
        expect(savedDef.steps).toHaveLength(1);

        await caller.workflow.update({
            id: created.id,
            name: 'WF Updated',
            steps: [{ id: savedDef.steps[0]!.id, name: 'Step 1', prompt: 'Do it now', continueOnFailure: false }]
        });
        expect(persistence.saveWorkflowDefinition).toHaveBeenCalledTimes(2);

        const published = await caller.workflow.publish({ workflowDefinitionId: created.id });
        expect(published.status).toBe('published');

        const nextVersion = await caller.workflow.createNextVersion({ sourceWorkflowDefinitionId: created.id });
        expect(nextVersion.version).toBe(2);
        expect(nextVersion.status).toBe('draft');
    });

    it('starts and cancels workflow execution', async () => {
        const persistence = createInMemoryPersistence();
        container.registerInstance('IPersistenceAdapter', persistence as never);
        container.registerInstance('IWorkflowRepository', persistence as never);

        container.registerInstance(WorkflowRunOrchestratorService, {
            executeWorkflow: vi.fn(async function* () {
                yield { type: 'workflow_started', workflowRunId: 'wr-1', workflowDefinitionId: 'wf-1' };
                await new Promise((resolve) => setTimeout(resolve, 50));
                yield { type: 'workflow_completed', workflowRunId: 'wr-1', success: true };
            })
        } as never);

        const caller = appRouter.createCaller({} as never);
        const startResult = await caller.workflow.start({ workflowDefinitionId: 'wf-1' });
        expect(startResult.success).toBe(true);

        const cancelResult = await caller.workflow.cancel();
        expect(cancelResult.success).toBe(true);
    });

    it('returns false when cancelling without active workflow', async () => {
        const caller = appRouter.createCaller({} as never);
        await caller.workflow.cancel();
        const cancelResult = await caller.workflow.cancel();
        expect(cancelResult.success).toBe(false);
    });

    it('supersedes previous workflow start when start is called twice', async () => {
        const persistence = createInMemoryPersistence();
        container.registerInstance('IPersistenceAdapter', persistence as never);
        container.registerInstance('IWorkflowRepository', persistence as never);

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

        container.registerInstance(WorkflowRunOrchestratorService, {
            executeWorkflow
        } as never);

        const caller = appRouter.createCaller({} as never);
        const firstStart = await caller.workflow.start({ workflowDefinitionId: 'wf-1' });
        const secondStart = await caller.workflow.start({ workflowDefinitionId: 'wf-2' });

        expect(firstStart.success).toBe(true);
        expect(secondStart.success).toBe(true);
        expect(executeWorkflow).toHaveBeenCalledTimes(2);
        expect(executeWorkflow.mock.calls[0]?.[0]).toBe('wf-1');
        expect(executeWorkflow.mock.calls[1]?.[0]).toBe('wf-2');
    });
});
