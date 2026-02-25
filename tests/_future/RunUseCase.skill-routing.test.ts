import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ExecutionController } from '@application/controllers/ExecutionController';
import { createRunUseCaseContext } from '../../../helpers/createRunUseCaseContext';

describe('RunUseCase skill routing', () => {
    it('injects preferred skill execution graph into planning prompt', async () => {
        const skill = {
            id: 'checkout.skill',
            version: '1.0.0',
            description: 'Complete checkout flow',
            trust: 'verified',
            schema: { input: {}, output: {} },
            preconditions: ['user authenticated'],
            postconditions: ['order confirmation visible'],
        };

        const ctx = createRunUseCaseContext({
            runId: 'run-skill-routing',
            skillRegistry: { get: vi.fn().mockReturnValue(skill) },
            skillGovernance: { isAllowed: vi.fn().mockReturnValue(true) },
        });

        const controller = new ExecutionController();
        const events: Array<{ type: string; [key: string]: unknown }> = [];
        for await (const event of ctx.useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'run checkout validation',
            options: {
                preferredSkillId: 'checkout.skill',
                allowedSkillTrustLevels: ['verified'],
            },
        }, controller)) {
            events.push(event as unknown as { type: string; [key: string]: unknown });
        }

        const executionGoal = (ctx.executor.executeStep.mock.calls[0] as unknown[])?.[1] as string;
        expect(executionGoal).toContain('Skill routing context:');
        expect(executionGoal).toContain('Selected skill: checkout.skill v1.0.0 (verified)');
        expect(executionGoal).toContain('Bounded skill execution graph:');
        expect(executionGoal).toContain('Validate precondition: user authenticated');
        expect(executionGoal).toContain('Verify postcondition: order confirmation visible');
        expect(events.filter((event) => event.type === 'skill_invocation')).toHaveLength(0);
        expect(ctx.executor.executeStep).toHaveBeenCalledTimes(1);
    });

    it('auto-selects matching skill when preferred skill is not provided', async () => {
        const ctx = createRunUseCaseContext({
            runId: 'run-skill-routing',
            skillRegistry: {
                list: vi.fn().mockReturnValue([
                    {
                        id: 'profile.update',
                        version: '1.0.0',
                        description: 'Update user profile settings',
                        trust: 'verified',
                        schema: { input: {}, output: {} },
                        preconditions: ['settings page is open'],
                        postconditions: ['new profile value visible'],
                    },
                ]),
            },
            skillGovernance: { isAllowed: vi.fn().mockReturnValue(true) },
        });

        const controller = new ExecutionController();
        for await (const event of ctx.useCase.execute({
            platformConfig: { platform: 'web', url: 'https://example.com' },
            prompt: 'open settings and update profile value',
            options: {
                allowedSkillTrustLevels: ['verified'],
            },
        }, controller)) {
            void event;
        }

        const executionGoal = (ctx.executor.executeStep.mock.calls[0] as unknown[])?.[1] as string;
        expect(executionGoal).toContain('Selected skill: profile.update v1.0.0 (verified)');
        expect(executionGoal).toContain('Routing source: auto');
    });
});
