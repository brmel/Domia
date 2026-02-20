import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ok, okAsync } from 'neverthrow';
import { RunTestUseCase } from '@application/use-cases/RunTestUseCase';
import type { RunTestOutput } from '@application/dtos';
import type { ILogger } from '@domain/ports';
import { ExecutionController } from '@application/controllers/ExecutionController';
import { RecoveryReadModelService } from '@application/services/execution/RecoveryReadModelService';
import { RunRecoveryPolicyService } from '@application/services/execution/RunRecoveryPolicyService';
import { CheckpointCompactionService } from '@application/services/execution/CheckpointCompactionService';
import { ManualRecoveryBootstrapService } from '@application/services/execution/ManualRecoveryBootstrapService';
import { RecoveryReplayGuardService } from '@application/services/execution/RecoveryReplayGuardService';
import { RecoveryReplayIdempotencyService } from '@application/services/execution/RecoveryReplayIdempotencyService';
import { ReplanningPolicyService } from '@application/services/execution/ReplanningPolicyService';
import { ActionType } from '@domain/enums/ActionType';

describe('RunTestUseCase budget hardening', () => {
    it('terminates run with workflow error when budget is exceeded', async () => {
        const planner = {
            plan: vi.fn().mockResolvedValue(ok({
                id: 'plan-budget',
                goal: 'goal',
                status: 'executing',
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                updatedAt: new Date('2026-01-01T00:00:00.000Z'),
                items: [
                    { id: 'item-1', description: 'execute action', status: 'pending', type: 'general' }
                ]
            }))
        };

        const lifecycleManager = {
            initializeTestRun: vi.fn().mockResolvedValue(ok('run-budget')),
            finalizeTestRun: vi.fn().mockResolvedValue(undefined),
            failTestRun: vi.fn().mockResolvedValue(undefined)
        };

        const executor = {
            executeStep: vi.fn(async function* () {
                yield {
                    type: 'action' as const,
                    action: {
                        type: ActionType.WAIT,
                        durationMs: 10,
                        thought: 'wait'
                    },
                    assets: {}
                };
                return { success: true as const, terminal: 'pass' as const };
            })
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
            resolveLimits: vi.fn().mockReturnValue({
                maxActions: 0,
                maxDurationMs: 999999,
                maxEstimatedTokens: 999999,
                maxRetries: 0
            }),
            assess: vi.fn().mockReturnValue({ status: 'exceeded', exceeded: ['actions'] }),
            evaluate: vi.fn().mockReturnValue({ status: 'exceeded', exceeded: ['actions'] }),
            formatExceededMessage: vi.fn().mockReturnValue('Run budget exceeded (actions). actions=1/0, durationMs=1/999999, tokens=10/999999, retries=0/0')
        };

        const logger: ILogger = {
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
            new ReplanningPolicyService(logger),
            { get: vi.fn().mockReturnValue(null) } as unknown as never,
            { isAllowed: vi.fn().mockReturnValue(false) } as unknown as never,
            { get: vi.fn().mockReturnValue(null) } as unknown as never,
            { authorize: vi.fn().mockReturnValue({ success: false, message: 'noop', decision: 'deny' }) } as unknown as never,
            { assess: vi.fn().mockReturnValue({ blocked: false, mode: 'observe' }) } as unknown as never,
            logger
        );

        const events: RunTestOutput[] = [];
        for await (const event of useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'budget enforce run',
            options: {
                maxSteps: 1
            }
        }, new ExecutionController())) {
            events.push(event);
        }

        expect(events.some(event => event.type === 'error')).toBe(true);
        expect(lifecycleManager.failTestRun).toHaveBeenCalled();
    });
});
