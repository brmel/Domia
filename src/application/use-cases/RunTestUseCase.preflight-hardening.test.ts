import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ok, okAsync } from 'neverthrow';
import { RunTestUseCase } from './RunTestUseCase';
import { ExecutionController } from '../controllers/ExecutionController';
import { RecoveryReadModelService } from '../services/execution/RecoveryReadModelService';
import { RunRecoveryPolicyService } from '../services/execution/RunRecoveryPolicyService';
import { CheckpointCompactionService } from '../services/execution/CheckpointCompactionService';
import { ManualRecoveryBootstrapService } from '../services/execution/ManualRecoveryBootstrapService';
import { RecoveryReplayGuardService } from '../services/execution/RecoveryReplayGuardService';
import { RecoveryReplayIdempotencyService } from '../services/execution/RecoveryReplayIdempotencyService';
import { ReplanningPolicyService } from '../services/execution/ReplanningPolicyService';

describe('RunTestUseCase preflight hardening', () => {
    it('does not fail run when skill/plugin preflight throws', async () => {
        const planner = {
            plan: vi.fn().mockResolvedValue(ok({
                id: 'plan',
                goal: 'goal',
                status: 'executing',
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
                updatedAt: new Date('2026-01-01T00:00:00.000Z'),
                items: []
            }))
        };

        const lifecycleManager = {
            initializeTestRun: vi.fn().mockResolvedValue(ok('run-preflight')),
            finalizeTestRun: vi.fn().mockResolvedValue(undefined),
            failTestRun: vi.fn().mockResolvedValue(undefined)
        };

        const executor = {
            executeStep: vi.fn(async function* () {
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
            resolveLimits: vi.fn().mockReturnValue({}),
            assess: vi.fn().mockReturnValue({ status: 'ok', exceeded: [] }),
            evaluate: vi.fn().mockReturnValue({ status: 'ok', exceeded: [] }),
            formatExceededMessage: vi.fn().mockReturnValue('Run budget exceeded')
        };

        const logger = {
            info: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn()
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
            new CheckpointCompactionService() as unknown as never,
            new RecoveryReadModelService() as unknown as never,
            new ManualRecoveryBootstrapService() as unknown as never,
            new RunRecoveryPolicyService() as unknown as never,
            new RecoveryReplayGuardService() as unknown as never,
            {
                shouldExecute: vi.fn().mockResolvedValue(true),
                markExecuted: vi.fn().mockResolvedValue(undefined)
            } as unknown as RecoveryReplayIdempotencyService,
            new ReplanningPolicyService(logger as unknown as never) as unknown as never,
            {
                get: vi.fn(() => {
                    throw new Error('skill-registry-boom');
                })
            } as unknown as never,
            {
                isAllowed: vi.fn(() => {
                    throw new Error('skill-governance-boom');
                })
            } as unknown as never,
            {
                get: vi.fn(() => {
                    throw new Error('plugin-registry-boom');
                })
            } as unknown as never,
            {
                authorize: vi.fn(() => {
                    throw new Error('plugin-gateway-boom');
                })
            } as unknown as never,
            {
                assess: vi.fn().mockReturnValue({ blocked: false, mode: 'observe' })
            } as unknown as never,
            logger as unknown as never
        );

        const controller = new ExecutionController();

        const events: Array<{ type: string; success?: boolean }> = [];
        for await (const event of useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'run with preflight errors isolated',
            options: {
                preferredSkillId: 'skill-a',
                pluginPreflight: {
                    pluginId: 'plugin-a',
                    capability: 'fs.read'
                }
            }
        }, controller)) {
            events.push(event as unknown as never);
        }

        expect(events.some(event => event.type === 'completed' && event.success === true)).toBe(true);
        expect(logger.warn).toHaveBeenCalled();
    });
});
