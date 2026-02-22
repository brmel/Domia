import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import type { TestStep } from '@domain/ports';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';
import type { Plan } from '@domain/entities/Plan';
import type { RunTestOutput } from '@application/dtos';
import { ElementIdFactory, WorkflowState } from '@domain/value-objects';
import { ExecutionController } from '@application/controllers/ExecutionController';
import { ActionType } from '@domain/enums/ActionType';
import { createRunTestUseCaseContext } from '../../../helpers/createRunTestUseCaseContext';

function createPlan(items: Plan['items']): Plan {
    const now = new Date('2026-01-01T00:00:00.000Z');
    return {
        id: 'plan-recovery',
        goal: 'Recover and continue',
        items,
        status: 'executing',
        createdAt: now,
        updatedAt: now
    };
}

function createCheckpoint(
    state: import('@domain/value-objects').WorkflowState,
    overrides?: Partial<Pick<CheckpointRecord, 'checkpointId' | 'parentCheckpointId' | 'branchId' | 'sequenceNumber' | 'commitBoundary' | 'sideEffectSetHash' | 'createdAt'>>
): CheckpointRecord {
    return {
        runId: 'recovery-run',
        checkpointId: overrides?.checkpointId ?? 'cp-recovery-1',
        parentCheckpointId: overrides?.parentCheckpointId ?? null,
        branchId: overrides?.branchId ?? 'run:recovery-run:main',
        sequenceNumber: overrides?.sequenceNumber ?? 1,
        commitBoundary: overrides?.commitBoundary ?? true,
        sideEffectSetHash: overrides?.sideEffectSetHash ?? null,
        createdAt: overrides?.createdAt ?? '2026-01-01T00:00:00.000Z',
        reason: 'action_applied',
        state
    };
}

function createUseCaseContext(
    checkpoints: readonly CheckpointRecord[] = [],
    sourceSteps: readonly TestStep[] = []
) {
    return createRunTestUseCaseContext({
        runId: 'new-run',
        checkpointRecords: checkpoints,
        persistence: {
            saveTestStep: vi.fn(() => okAsync(undefined)),
            getTestSteps: vi.fn(() => okAsync([...sourceSteps])),
        },
    });
}

describe('RunTestUseCase recovery flow', () => {

    it('reuses checkpoint plan in manual-only mode and skips planner', async () => {
        const checkpointState = {
            ...WorkflowState.initial(),
            stepNumber: 0,
            plan: createPlan([
                { id: 'a', description: 'done', status: 'completed', type: 'general' },
                { id: 'b', description: 'done', status: 'completed', type: 'code' }
            ])
        };

        const ctx = createUseCaseContext([createCheckpoint(checkpointState)]);
        const controller = new ExecutionController();

        const events: RunTestOutput[] = [];
        for await (const event of ctx.useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'recover this run',
            options: {
                recoveryMode: 'manual-only',
                recoveryRunId: 'recovery-run'
            }
        }, controller)) {
            events.push(event);
        }

        expect(events.some(e => e.type === 'started')).toBe(true);
        expect(events.some(e => e.type === 'completed' && e.success === true)).toBe(true);
    });

    it('falls back to planning when recovery run has no checkpoints', async () => {
        const ctx = createUseCaseContext([]);
        const controller = new ExecutionController();

        const events: RunTestOutput[] = [];
        for await (const event of ctx.useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'replan from scratch',
            options: {
                recoveryMode: 'manual-only',
                recoveryRunId: 'missing-run'
            }
        }, controller)) {
            events.push(event);
        }

        expect(events.some(e => e.type === 'completed' && e.success === true)).toBe(true);
    });

    it('continues normally when recovery option is omitted', async () => {
        const ctx = createUseCaseContext([]);
        const controller = new ExecutionController();

        const events: RunTestOutput[] = [];
        for await (const event of ctx.useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'normal run without recovery'
        }, controller)) {
            events.push(event);
        }

        expect(ctx.durability.getCheckpointRecords).toHaveBeenCalledTimes(1);
        expect(ctx.durability.getCheckpointRecords).toHaveBeenCalledWith('new-run');
        expect(events.some(e => e.type === 'completed' && e.success === true)).toBe(true);
    });

    it('resumes from first pending item and executes only remaining steps', async () => {
        const checkpointState = {
            ...WorkflowState.initial(),
            stepNumber: 3,
            plan: createPlan([
                { id: 'a', description: 'already done', status: 'completed', type: 'general' },
                { id: 'b', description: 'pending one', status: 'pending', type: 'code' },
                { id: 'c', description: 'pending two', status: 'pending', type: 'general' }
            ])
        };

        const sourceSteps: TestStep[] = [
            {
                id: 'step-1',
                testRunId: 'recovery-run',
                stepNumber: 1,
                actionType: ActionType.WAIT,
                actionPayload: { type: ActionType.WAIT, durationMs: 100, thought: 'wait' },
                timestamp: '2026-01-01T00:00:00.000Z'
            },
            {
                id: 'step-2',
                testRunId: 'recovery-run',
                stepNumber: 2,
                actionType: ActionType.SCROLL,
                actionPayload: { type: ActionType.SCROLL, direction: 'down', thought: 'scroll' },
                timestamp: '2026-01-01T00:00:01.000Z'
            },
            {
                id: 'step-3',
                testRunId: 'recovery-run',
                stepNumber: 3,
                actionType: ActionType.WAIT,
                actionPayload: { type: ActionType.WAIT, durationMs: 50, thought: 'wait again' },
                timestamp: '2026-01-01T00:00:02.000Z'
            }
        ];

        const ctx = createUseCaseContext([createCheckpoint(checkpointState)], sourceSteps);
        const controller = new ExecutionController();

        const events: RunTestOutput[] = [];
        for await (const event of ctx.useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'resume partial plan',
            options: {
                recoveryMode: 'manual-only',
                recoveryRunId: 'recovery-run'
            }
        }, controller)) {
            events.push(event);
        }

        expect(ctx.executor.executeStep).toHaveBeenCalledTimes(2);
        expect(ctx.executor.executeStep).toHaveBeenNthCalledWith(
            1,
            'new-run',
            'pending one',
            expect.anything(),
            'https://example.com',
            3,
            expect.any(Object)
        );
        expect(ctx.executor.executeStep).toHaveBeenNthCalledWith(
            2,
            'new-run',
            'pending two',
            expect.anything(),
            'https://example.com',
            3,
            expect.any(Object)
        );
        expect(events.some(e => e.type === 'completed' && e.success === true)).toBe(true);
    });

    it('replays idempotent actions from source run before resuming execution', async () => {
        const checkpointState = {
            ...WorkflowState.initial(),
            stepNumber: 2,
            plan: createPlan([
                { id: 'a', description: 'already done', status: 'completed', type: 'general' },
                { id: 'b', description: 'pending', status: 'pending', type: 'code' }
            ])
        };

        const sourceSteps: TestStep[] = [
            {
                id: 'step-1',
                testRunId: 'recovery-run',
                stepNumber: 1,
                actionType: ActionType.WAIT,
                actionPayload: { type: ActionType.WAIT, durationMs: 100, thought: 'wait' },
                timestamp: '2026-01-01T00:00:00.000Z'
            },
            {
                id: 'step-2',
                testRunId: 'recovery-run',
                stepNumber: 2,
                actionType: ActionType.SCROLL,
                actionPayload: { type: ActionType.SCROLL, direction: 'down', thought: 'scroll' },
                timestamp: '2026-01-01T00:00:01.000Z'
            }
        ];

        const ctx = createUseCaseContext([createCheckpoint(checkpointState)], sourceSteps);
        const controller = new ExecutionController();

        for await (const event of ctx.useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'replay idempotent actions',
            options: {
                recoveryMode: 'manual-only',
                recoveryRunId: 'recovery-run'
            }
        }, controller)) {
            void event;
        }

        expect(ctx.persistence.getTestSteps).toHaveBeenCalledWith('recovery-run');
        expect(ctx.browser.wait).toHaveBeenCalledTimes(1);
        expect(ctx.browser.scroll).toHaveBeenCalledTimes(1);
        expect(ctx.executor.executeStep).toHaveBeenCalledTimes(1);
    });

    it('fails recovery when replay encounters non-idempotent actions', async () => {
        const checkpointState = {
            ...WorkflowState.initial(),
            stepNumber: 1,
            plan: createPlan([
                { id: 'a', description: 'pending', status: 'pending', type: 'general' }
            ])
        };

        const sourceSteps: TestStep[] = [
            {
                id: 'step-1',
                testRunId: 'recovery-run',
                stepNumber: 1,
                actionType: ActionType.CLICK,
                actionPayload: { type: ActionType.CLICK, elementId: ElementIdFactory.unsafe(1), thought: 'click' },
                timestamp: '2026-01-01T00:00:00.000Z'
            }
        ];

        const ctx = createUseCaseContext([createCheckpoint(checkpointState)], sourceSteps);
        const controller = new ExecutionController();

        const events: RunTestOutput[] = [];
        for await (const event of ctx.useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'should fail blocked replay',
            options: {
                recoveryMode: 'manual-only',
                recoveryRunId: 'recovery-run'
            }
        }, controller)) {
            events.push(event);
        }

        expect(ctx.executor.executeStep).not.toHaveBeenCalled();
        expect(events.some(e => e.type === 'error')).toBe(true);
    });

    it('honors cancellation during replay before step execution', async () => {
        const checkpointState = {
            ...WorkflowState.initial(),
            stepNumber: 1,
            plan: createPlan([
                { id: 'a', description: 'pending', status: 'pending', type: 'general' }
            ])
        };

        const sourceSteps: TestStep[] = [
            {
                id: 'step-1',
                testRunId: 'recovery-run',
                stepNumber: 1,
                actionType: ActionType.WAIT,
                actionPayload: { type: ActionType.WAIT, durationMs: 100, thought: 'wait' },
                timestamp: '2026-01-01T00:00:00.000Z'
            }
        ];

        const ctx = createUseCaseContext([createCheckpoint(checkpointState)], sourceSteps);
        const controller = new ExecutionController();
        controller.stop();

        const events: RunTestOutput[] = [];
        for await (const event of ctx.useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'cancel during replay',
            options: {
                recoveryMode: 'manual-only',
                recoveryRunId: 'recovery-run'
            }
        }, controller)) {
            events.push(event);
        }

        expect(ctx.executor.executeStep).not.toHaveBeenCalled();
        expect(events.some(e => e.type === 'completed' && e.success === false)).toBe(true);
    });

    it('dedupes replay when idempotency key already executed', async () => {
        const checkpointState = {
            ...WorkflowState.initial(),
            stepNumber: 1,
            plan: createPlan([
                { id: 'a', description: 'pending', status: 'pending', type: 'general' }
            ])
        };

        const sourceSteps: TestStep[] = [
            {
                id: 'step-1',
                testRunId: 'recovery-run',
                stepNumber: 1,
                actionType: ActionType.WAIT,
                actionPayload: { type: ActionType.WAIT, durationMs: 100, thought: 'wait' },
                timestamp: '2026-01-01T00:00:00.000Z'
            }
        ];

        const ctx = createUseCaseContext([createCheckpoint(checkpointState)], sourceSteps);
        vi.mocked(ctx.replayIdempotency.shouldExecute).mockResolvedValue(false);

        const controller = new ExecutionController();

        for await (const event of ctx.useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'dedupe replay',
            options: {
                recoveryMode: 'manual-only',
                recoveryRunId: 'recovery-run'
            }
        }, controller)) {
            void event;
        }

        expect(ctx.browser.wait).not.toHaveBeenCalled();
        expect(ctx.replayIdempotency.markExecuted).not.toHaveBeenCalled();
        expect(ctx.executor.executeStep).toHaveBeenCalledTimes(1);
    });

    it('rolls recovery to nearest commit boundary checkpoint before replay', async () => {
        const checkpointAtBoundary = {
            ...WorkflowState.initial(),
            stepNumber: 1,
            plan: createPlan([
                { id: 'a', description: 'pending', status: 'pending', type: 'general' }
            ])
        };

        const latestCheckpoint = {
            ...checkpointAtBoundary,
            stepNumber: 2
        };

        const checkpoints: CheckpointRecord[] = [
            createCheckpoint(checkpointAtBoundary, {
                checkpointId: 'cp-1',
                sequenceNumber: 1,
                commitBoundary: true,
                createdAt: '2026-01-01T00:00:00.000Z'
            }),
            createCheckpoint(latestCheckpoint, {
                checkpointId: 'cp-2',
                parentCheckpointId: 'cp-1',
                sequenceNumber: 2,
                commitBoundary: false,
                createdAt: '2026-01-01T00:00:01.000Z'
            })
        ];

        const sourceSteps: TestStep[] = [
            {
                id: 'step-1',
                testRunId: 'recovery-run',
                stepNumber: 1,
                actionType: ActionType.WAIT,
                actionPayload: { type: ActionType.WAIT, durationMs: 50, thought: 'wait-1' },
                timestamp: '2026-01-01T00:00:00.000Z'
            },
            {
                id: 'step-2',
                testRunId: 'recovery-run',
                stepNumber: 2,
                actionType: ActionType.WAIT,
                actionPayload: { type: ActionType.WAIT, durationMs: 50, thought: 'wait-2' },
                timestamp: '2026-01-01T00:00:01.000Z'
            }
        ];

        const ctx = createUseCaseContext(checkpoints, sourceSteps);
        const controller = new ExecutionController();

        for await (const event of ctx.useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'recover with rollback boundary',
            options: {
                recoveryMode: 'manual-only',
                recoveryRunId: 'recovery-run'
            }
        }, controller)) {
            void event;
        }

        expect(ctx.browser.wait).toHaveBeenCalledTimes(1);
        expect(ctx.executor.executeStep).toHaveBeenCalledTimes(1);
    });

    it('does not trigger replanning telemetry when replay is blocked pre-execution', async () => {
        const checkpointState = {
            ...WorkflowState.initial(),
            stepNumber: 1,
            plan: createPlan([
                { id: 'a', description: 'pending', status: 'pending', type: 'general' }
            ])
        };

        const sourceSteps: TestStep[] = [
            {
                id: 'step-1',
                testRunId: 'recovery-run',
                stepNumber: 1,
                actionType: ActionType.CLICK,
                actionPayload: { type: ActionType.CLICK, elementId: ElementIdFactory.unsafe(1), thought: 'click' },
                timestamp: '2026-01-01T00:00:00.000Z'
            }
        ];

        const ctx = createUseCaseContext([createCheckpoint(checkpointState)], sourceSteps);
        const controller = new ExecutionController();

        const events: RunTestOutput[] = [];
        for await (const event of ctx.useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'blocked replay should not replan',
            options: {
                recoveryMode: 'manual-only',
                recoveryRunId: 'recovery-run'
            }
        }, controller)) {
            events.push(event);
        }

        expect(ctx.executor.executeStep).not.toHaveBeenCalled();
        expect(events.some((event) => event.type === 'replanning')).toBe(false);
        expect(events.some((event) => event.type === 'error')).toBe(true);
    });

    it('allows replanning after successful replay when resumed step fails', async () => {
        const checkpointState = {
            ...WorkflowState.initial(),
            stepNumber: 1,
            plan: createPlan([
                { id: 'a', description: 'pending', status: 'pending', type: 'general' }
            ])
        };

        const sourceSteps: TestStep[] = [
            {
                id: 'step-1',
                testRunId: 'recovery-run',
                stepNumber: 1,
                actionType: ActionType.WAIT,
                actionPayload: { type: ActionType.WAIT, durationMs: 25, thought: 'wait' },
                timestamp: '2026-01-01T00:00:00.000Z'
            }
        ];

        const ctx = createUseCaseContext([createCheckpoint(checkpointState)], sourceSteps);

        let executionCount = 0;
        (ctx.executor.executeStep as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
            yield* [];
            executionCount += 1;

            if (executionCount === 1) {
                return {
                    success: false as const,
                    terminal: 'fail' as const,
                    code: 'assertion_fail' as const,
                    reason: 'assertion mismatch'
                };
            }

            return {
                success: true as const,
                terminal: 'pass' as const
            };
        });

        const controller = new ExecutionController();

        const events: RunTestOutput[] = [];
        for await (const event of ctx.useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'replan after replay',
            options: {
                recoveryMode: 'manual-only',
                recoveryRunId: 'recovery-run'
            }
        }, controller)) {
            events.push(event);
        }

        expect(ctx.browser.wait).toHaveBeenCalledTimes(1);
        expect(ctx.executor.executeStep).toHaveBeenCalledTimes(1);
        expect(events.some((event) => event.type === 'replanning')).toBe(true);
        expect(events.some((event) => event.type === 'completed' && event.success === false)).toBe(true);
    });
});
