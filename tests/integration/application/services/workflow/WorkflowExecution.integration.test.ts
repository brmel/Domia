import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { WorkflowRunOrchestratorService } from '@application/services/workflow/WorkflowRunOrchestratorService';
import { WorkflowStepPolicyService } from '@application/services/workflow/WorkflowStepPolicyService';
import { WorkflowStepRunnerService } from '@application/services/workflow/WorkflowStepRunnerService';
import { WorkflowStepGovernanceService } from '@application/services/workflow/WorkflowStepGovernanceService';
import { PlatformCapabilityNegotiationService } from '@application/services/platform/PlatformCapabilityNegotiationService';
import { ExecutionController } from '@application/controllers/ExecutionController';
import type { WorkflowDefinition, WorkflowRunRecord, WorkflowStepRunRecord } from '@domain/entities/Workflow';
import type { AtomicWorkflowTransitionInput } from '@domain/ports/IPersistenceAdapter';
import type { IWorkflowRepository } from '@domain/ports/IWorkflowRepository';

function createStatefulPersistence(definitions: WorkflowDefinition[]): IWorkflowRepository & {
    readonly storedRuns: Map<string, WorkflowRunRecord>;
    readonly storedStepRuns: Map<string, WorkflowStepRunRecord>;
} {
    const defs = new Map(definitions.map(d => [d.id, d]));
    const runs = new Map<string, WorkflowRunRecord>();
    const stepRuns = new Map<string, WorkflowStepRunRecord>();

    return {
        storedRuns: runs,
        storedStepRuns: stepRuns,

        saveWorkflowDefinition: (d: WorkflowDefinition) => { defs.set(d.id, d); return okAsync(undefined); },
        getWorkflowDefinition: (id: string) => okAsync(defs.get(id) ?? null),
        getWorkflowDefinitions: () => okAsync(Array.from(defs.values())),

        saveWorkflowRun: (run: WorkflowRunRecord) => { runs.set(run.id, run); return okAsync(undefined); },
        updateWorkflowRun: (id: string, updates: Partial<WorkflowRunRecord>) => {
            const existing = runs.get(id);
            if (existing) runs.set(id, { ...existing, ...updates });
            return okAsync(undefined);
        },
        getWorkflowRun: (id: string) => okAsync(runs.get(id) ?? null),
        getWorkflowRuns: () => okAsync(Array.from(runs.values())),

        saveWorkflowStepRun: (sr: WorkflowStepRunRecord) => { stepRuns.set(sr.id, sr); return okAsync(undefined); },
        updateWorkflowStepRun: (id: string, updates: Partial<WorkflowStepRunRecord>) => {
            const existing = stepRuns.get(id);
            if (existing) stepRuns.set(id, { ...existing, ...updates });
            return okAsync(undefined);
        },
        getWorkflowStepRuns: (workflowRunId: string) => okAsync(
            Array.from(stepRuns.values()).filter(sr => sr.workflowRunId === workflowRunId)
        ),
        commitAtomicWorkflowTransition: (input: AtomicWorkflowTransitionInput) => {
            const run = runs.get(input.workflowRunId);
            if (run) runs.set(input.workflowRunId, { ...run, ...input.workflowRunUpdates });
            const sr = stepRuns.get(input.workflowStepRunId);
            if (sr) stepRuns.set(input.workflowStepRunId, { ...sr, ...input.workflowStepRunUpdates });
            return okAsync(undefined);
        },
    };
}

const noopLogger = {
    info: (): void => undefined,
    warn: (): void => undefined,
    error: (): void => undefined,
    debug: (): void => undefined,
    setLevel: (): void => undefined,
};

describe('Workflow execution integration', () => {
    const definition: WorkflowDefinition = {
        id: 'wf-1',
        name: 'Workflow',
        status: 'draft',
        version: 1,
        platformConfig: { platform: 'web', url: 'https://example.com' },
        steps: [
            { id: 's1', name: 'First Step', prompt: 'do first thing', continueOnFailure: false },
            { id: 's2', name: 'Second Step', prompt: 'do second thing', continueOnFailure: false },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    };

    function createStepRunner(behavior: 'succeed' | 'fail') {
        return new WorkflowStepRunnerService({
            execute: vi.fn(async function* () {
                yield { type: 'started' as const, runId: `run-${Date.now()}` };
                if (behavior === 'succeed') {
                    yield { type: 'completed' as const, success: true, summary: 'step ok' };
                } else {
                    yield { type: 'completed' as const, success: false, summary: 'step failed' };
                }
            })
        } as unknown as never, {
            createSession: vi.fn(async () => ({
                executionUrl: 'https://example.com',
                shouldNavigate: true,
                automation: {},
                dispose: vi.fn(async () => undefined)
            }))
        } as unknown as never);
    }

    it('governance block atomically persists failed status in store', async () => {
        const persistence = createStatefulPersistence([definition]);

        const governance = new WorkflowStepGovernanceService({
            assess: vi.fn().mockReturnValue({ blocked: true, mode: 'soft-enforce' })
        } as unknown as never);

        const orchestrator = new WorkflowRunOrchestratorService(
            persistence as unknown as never,
            noopLogger as unknown as never,
            new WorkflowStepPolicyService(),
            governance,
            createStepRunner('succeed'),
            new PlatformCapabilityNegotiationService()
        );
        const controller = new ExecutionController();
        controller.start();

        const events: string[] = [];
        for await (const event of orchestrator.executeWorkflow('wf-1', controller)) {
            events.push(event.type);
        }

        expect(events).toEqual([
            'workflow_started',
            'workflow_step_started',
            'workflow_step_completed',
            'workflow_failed',
        ]);

        expect(persistence.storedRuns.size).toBe(1);
        const [workflowRun] = [...persistence.storedRuns.values()];
        expect(workflowRun.status).toBe('failed');
        expect(workflowRun.summary).toContain('readiness policy');

        const stepRuns = [...persistence.storedStepRuns.values()];
        expect(stepRuns).toHaveLength(1);
        expect(stepRuns[0].status).toBe('failed');
    });

    it('successful workflow persists completed status with step runs', async () => {
        const singleStepDef: WorkflowDefinition = {
            ...definition,
            steps: [definition.steps[0]],
        };
        const persistence = createStatefulPersistence([singleStepDef]);

        const governance = new WorkflowStepGovernanceService({
            assess: vi.fn().mockReturnValue({ blocked: false })
        } as unknown as never);

        const orchestrator = new WorkflowRunOrchestratorService(
            persistence as unknown as never,
            noopLogger as unknown as never,
            new WorkflowStepPolicyService(),
            governance,
            createStepRunner('succeed'),
            new PlatformCapabilityNegotiationService()
        );
        const controller = new ExecutionController();
        controller.start();

        const events: string[] = [];
        for await (const event of orchestrator.executeWorkflow(singleStepDef.id, controller)) {
            events.push(event.type);
        }

        expect(events).toContain('workflow_started');
        expect(events).toContain('workflow_step_started');
        expect(events).toContain('workflow_step_completed');
        expect(events).toContain('workflow_completed');

        const [workflowRun] = [...persistence.storedRuns.values()];
        expect(workflowRun.status).toBe('completed');
        expect(workflowRun.summary).toContain('1/1 steps succeeded');

        const stepRuns = [...persistence.storedStepRuns.values()];
        expect(stepRuns).toHaveLength(1);
        expect(stepRuns[0].status).toBe('completed');
    });

    it('step failure without continueOnFailure persists failed run via atomic transition', async () => {
        const persistence = createStatefulPersistence([definition]);

        const governance = new WorkflowStepGovernanceService({
            assess: vi.fn().mockReturnValue({ blocked: false })
        } as unknown as never);

        const orchestrator = new WorkflowRunOrchestratorService(
            persistence as unknown as never,
            noopLogger as unknown as never,
            new WorkflowStepPolicyService(),
            governance,
            createStepRunner('fail'),
            new PlatformCapabilityNegotiationService()
        );
        const controller = new ExecutionController();
        controller.start();

        const events: string[] = [];
        for await (const event of orchestrator.executeWorkflow('wf-1', controller)) {
            events.push(event.type);
        }

        expect(events).toContain('workflow_failed');
        expect(events).not.toContain('workflow_completed');

        const [workflowRun] = [...persistence.storedRuns.values()];
        expect(workflowRun.status).toBe('failed');

        const stepRuns = [...persistence.storedStepRuns.values()];
        expect(stepRuns).toHaveLength(1);
        expect(stepRuns[0].status).toBe('failed');
    });

    it('missing definition yields workflow_failed with unknown workflowRunId', async () => {
        const persistence = createStatefulPersistence([]);

        const orchestrator = new WorkflowRunOrchestratorService(
            persistence as unknown as never,
            noopLogger as unknown as never,
            new WorkflowStepPolicyService(),
            new WorkflowStepGovernanceService({ assess: vi.fn() } as unknown as never),
            createStepRunner('succeed'),
            new PlatformCapabilityNegotiationService()
        );
        const controller = new ExecutionController();
        controller.start();

        const events: Array<{ type: string; reason?: string }> = [];
        for await (const event of orchestrator.executeWorkflow('nonexistent', controller)) {
            events.push(event as never);
        }

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('workflow_failed');
        expect((events[0] as { reason: string }).reason).toContain('not found');

        expect(persistence.storedRuns.size).toBe(0);
    });
});
