import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ok, okAsync } from 'neverthrow';
import { RunTestUseCase } from '@application/use-cases/RunTestUseCase';
import { ExecutionController } from '@application/controllers/ExecutionController';
import { ActionType } from '@domain/enums/ActionType';
import { RecoveryReadModelService } from '@application/services/execution/RecoveryReadModelService';
import { RunRecoveryPolicyService } from '@application/services/execution/RunRecoveryPolicyService';
import { CheckpointCompactionService } from '@application/services/execution/CheckpointCompactionService';
import { ManualRecoveryBootstrapService } from '@application/services/execution/ManualRecoveryBootstrapService';
import { RecoveryReplayGuardService } from '@application/services/execution/RecoveryReplayGuardService';
import type { RecoveryReplayIdempotencyService } from '@application/services/execution/RecoveryReplayIdempotencyService';
import { ReplanningPolicyService } from '@application/services/execution/ReplanningPolicyService';

describe('RunTestUseCase replanning advice propagation', () => {
    it('includes evaluator context in replanning prompt after failed step', async () => {
        const planner = {
            plan: vi.fn()
                .mockResolvedValueOnce(ok({
                    id: 'plan-initial',
                    goal: 'goal',
                    status: 'executing',
                    createdAt: new Date('2026-01-01T00:00:00.000Z'),
                    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
                    items: [
                        { id: 'step-1', description: 'do thing', status: 'pending', type: 'general' }
                    ]
                }))
                .mockResolvedValueOnce(ok({
                    id: 'plan-replanned',
                    goal: 'goal',
                    status: 'executing',
                    createdAt: new Date('2026-01-01T00:00:00.000Z'),
                    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
                    items: [
                        { id: 'step-2', description: 'retry thing', status: 'pending', type: 'general' }
                    ]
                }))
        };

        let executionCount = 0;
        const executor = {
            executeStep: vi.fn(async function* (
                _runId: string,
                _goal: string,
                _browser: unknown,
                _url: string,
                _stepNumber: number,
                _options: unknown,
                executionContext?: { onEvaluation?: (telemetry: unknown) => void | Promise<void> }
            ) {
                executionCount += 1;

                if (executionCount === 1) {
                    await executionContext?.onEvaluation?.({
                        evaluation: {
                            decision: 'need_retry',
                            summary: 'Confirmation was weak',
                            advice: 'Validate using explicit visible confirmation text.',
                            confidence: 0.64,
                            evidence: ['Failure reason indicates weak verification confidence.']
                        },
                        attemptedAction: {
                            type: ActionType.FAIL,
                            reason: 'could not verify',
                            thought: 'failing this attempt'
                        },
                        executionOutcome: 'not_executed',
                        executionError: 'could not verify'
                    });

                    yield {
                        type: 'action' as const,
                        action: {
                            type: ActionType.FAIL,
                            reason: 'could not verify',
                            thought: 'failing this attempt'
                        },
                        assets: {}
                    };

                    return {
                        success: false as const,
                        terminal: 'fail' as const,
                        code: 'agent_fail' as const,
                        reason: 'could not verify'
                    };
                }

                yield {
                    type: 'action' as const,
                    action: {
                        type: ActionType.PASS,
                        summary: 'done',
                        thought: 'done'
                    },
                    assets: {}
                };

                return {
                    success: true as const,
                    terminal: 'pass' as const
                };
            })
        };

        const lifecycleManager = {
            initializeTestRun: vi.fn().mockResolvedValue(ok('run-replan-advice')),
            finalizeTestRun: vi.fn().mockResolvedValue(undefined),
            failTestRun: vi.fn().mockResolvedValue(undefined)
        };

        const persistence = {
            saveTestStep: vi.fn(() => okAsync(undefined)),
            getTestSteps: vi.fn(() => okAsync([]))
        };

        const trace = {
            endTrace: vi.fn().mockResolvedValue(undefined)
        };

        const sessionFactory = {
            createSession: vi.fn().mockResolvedValue({
                browser: {
                    waitForDOMStable: vi.fn().mockResolvedValue(undefined),
                    navigateTo: vi.fn(() => okAsync(undefined))
                },
                shouldNavigate: false,
                dispose: vi.fn().mockResolvedValue(undefined)
            })
        };

        const laneService = {
            acquire: vi.fn().mockResolvedValue(vi.fn())
        };

        const durability = {
            transition: vi.fn((_: string, __: string, next: string) => next),
            checkpoint: vi.fn().mockResolvedValue(undefined),
            getCheckpointRecords: vi.fn().mockResolvedValue([])
        };

        const budgetPolicy = {
            resolveLimits: vi.fn().mockReturnValue({}),
            assess: vi.fn().mockReturnValue({ status: 'ok', exceeded: [] }),
            evaluate: vi.fn().mockReturnValue({ status: 'ok', exceeded: [] }),
            formatExceededMessage: vi.fn().mockReturnValue('Run budget exceeded')
        };

        const logger = {
            info: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            error: vi.fn()
        };

        const useCase = new RunTestUseCase(
            lifecycleManager as unknown as never,
            planner as unknown as never,
            executor as unknown as never,
            persistence as unknown as never,
            trace as unknown as never,
            sessionFactory as unknown as never,
            laneService as unknown as never,
            durability as unknown as never,
            budgetPolicy as unknown as never,
            new CheckpointCompactionService(),
            new RecoveryReadModelService(),
            new ManualRecoveryBootstrapService(),
            new RunRecoveryPolicyService(),
            new RecoveryReplayGuardService(),
            {
                shouldExecute: vi.fn().mockResolvedValue(true),
                markExecuted: vi.fn().mockResolvedValue(undefined)
            } as unknown as RecoveryReplayIdempotencyService,
            new ReplanningPolicyService(logger as unknown as never),
            { get: vi.fn().mockReturnValue(null) } as unknown as never,
            { isAllowed: vi.fn().mockReturnValue(false) } as unknown as never,
            { get: vi.fn().mockReturnValue(null) } as unknown as never,
            { authorize: vi.fn().mockReturnValue({ success: false, message: 'noop', decision: 'deny' }) } as unknown as never,
            { assess: vi.fn().mockReturnValue({ blocked: false, mode: 'observe' }) } as unknown as never,
            logger as unknown as never
        );

        const controller = new ExecutionController();
        for await (const event of useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'do the task',
            options: { maxSteps: 5 }
        }, controller)) {
            void event;
        }

        expect(planner.plan).toHaveBeenCalledTimes(2);
        const secondPlannerCallPrompt = planner.plan.mock.calls[1]?.[0] as string;
        expect(secondPlannerCallPrompt).toContain('Evaluator context:');
        expect(secondPlannerCallPrompt).toContain('Evaluator decision: need_retry');
        expect(secondPlannerCallPrompt).toContain('Evaluator advice: Validate using explicit visible confirmation text.');
        expect(secondPlannerCallPrompt).toContain('Latest evaluator advice in workflow state:');
    });
});
