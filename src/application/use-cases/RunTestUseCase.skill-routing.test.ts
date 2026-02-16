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

function createUseCaseWithSkillRouting(skillRegistryOverrides?: { get?: ReturnType<typeof vi.fn>; list?: ReturnType<typeof vi.fn> }) {
    const planner = {
        plan: vi.fn().mockResolvedValue(ok({
            id: 'plan-skill-routing',
            goal: 'goal',
            status: 'executing',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            items: []
        }))
    };

    const lifecycleManager = {
        initializeTestRun: vi.fn().mockResolvedValue(ok('run-skill-routing')),
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
        debug: vi.fn(),
        error: vi.fn()
    };

    const skillRegistry = {
        get: skillRegistryOverrides?.get ?? vi.fn().mockReturnValue(null),
        list: skillRegistryOverrides?.list ?? vi.fn().mockReturnValue([])
    };

    const useCase = new RunTestUseCase(
        lifecycleManager as any,
        planner as any,
        executor as any,
        persistence as any,
        trace as any,
        sessionFactory as any,
        laneService as any,
        durability as any,
        budgetPolicy as any,
        new CheckpointCompactionService() as any,
        new RecoveryReadModelService() as any,
        new ManualRecoveryBootstrapService() as any,
        new RunRecoveryPolicyService() as any,
        new RecoveryReplayGuardService() as any,
        {
            shouldExecute: vi.fn().mockResolvedValue(true),
            markExecuted: vi.fn().mockResolvedValue(undefined)
        } as unknown as RecoveryReplayIdempotencyService,
        new ReplanningPolicyService(logger as any) as any,
        skillRegistry as any,
        {
            isAllowed: vi.fn().mockReturnValue(true)
        } as any,
        {
            get: vi.fn().mockReturnValue(null)
        } as any,
        {
            authorize: vi.fn().mockReturnValue({ success: false, message: 'not-called', decision: 'deny' })
        } as any,
        {
            assess: vi.fn().mockReturnValue({ blocked: false, mode: 'observe' })
        } as any,
        logger as any
    );

    return {
        useCase,
        planner,
        skillRegistry,
        executor
    };
}

describe('RunTestUseCase skill routing', () => {
    it('injects preferred skill execution graph into planning prompt', async () => {
        const skill = {
            id: 'checkout.skill',
            version: '1.0.0',
            description: 'Complete checkout flow',
            trust: 'verified',
            schema: { input: {}, output: {} },
            preconditions: ['user authenticated'],
            postconditions: ['order confirmation visible']
        };

        const { useCase, planner, executor } = createUseCaseWithSkillRouting({
            get: vi.fn().mockReturnValue(skill)
        });

        const controller = new ExecutionController();
        const events: Array<{ type: string; [key: string]: unknown }> = [];
        for await (const event of useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'run checkout validation',
            options: {
                preferredSkillId: 'checkout.skill',
                allowedSkillTrustLevels: ['verified']
            }
        }, controller)) {
            events.push(event as unknown as { type: string; [key: string]: unknown });
        }

        const planningPrompt = planner.plan.mock.calls[0]?.[0] as string;
        expect(planningPrompt).toContain('Skill routing context:');
        expect(planningPrompt).toContain('Selected skill: checkout.skill v1.0.0 (verified)');
        expect(planningPrompt).toContain('Bounded skill execution graph:');
        expect(planningPrompt).toContain('Validate precondition: user authenticated');
        expect(planningPrompt).toContain('Verify postcondition: order confirmation visible');
        expect(events.filter((event) => event.type === 'skill_invocation')).toHaveLength(2);
        expect(executor.executeStep).toHaveBeenCalledTimes(3);
    });

    it('auto-selects matching skill when preferred skill is not provided', async () => {
        const { useCase, planner } = createUseCaseWithSkillRouting({
            list: vi.fn().mockReturnValue([
                {
                    id: 'profile.update',
                    version: '1.0.0',
                    description: 'Update user profile settings',
                    trust: 'verified',
                    schema: { input: {}, output: {} },
                    preconditions: ['settings page is open'],
                    postconditions: ['new profile value visible']
                }
            ])
        });

        const controller = new ExecutionController();
        for await (const _event of useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'open settings and update profile value',
            options: {
                allowedSkillTrustLevels: ['verified']
            }
        }, controller)) {
        }

        const planningPrompt = planner.plan.mock.calls[0]?.[0] as string;
        expect(planningPrompt).toContain('Selected skill: profile.update v1.0.0 (verified)');
        expect(planningPrompt).toContain('Routing source: auto');
    });
});
