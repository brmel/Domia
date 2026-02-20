import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { SkillExecutorService } from '@application/services/skills/SkillExecutorService';

describe('SkillExecutorService', () => {
    it('builds runtime plan with preconditions, objective, and postconditions', () => {
        const service = new SkillExecutorService();
        const skill = {
            id: 'checkout.skill',
            version: '1.0.0',
            description: 'Complete checkout flow',
            trust: 'verified' as const,
            schema: { input: {}, output: {} },
            preconditions: ['user authenticated'],
            postconditions: ['order confirmation visible']
        };

        const runtimePlan = service.buildRuntimePlan(skill, 'run checkout validation');

        expect(runtimePlan.items).toHaveLength(3);
        expect(runtimePlan.items[0]?.description).toBe('Validate precondition: user authenticated');
        expect(runtimePlan.items[1]?.description).toBe('Execute skill objective: Complete checkout flow');
        expect(runtimePlan.items[2]?.description).toBe('Verify postcondition: order confirmation visible');
        expect(runtimePlan.items.every((item) => item.metadata?.['source'] === 'skill-runtime')).toBe(true);
    });

    it('prepends runtime skill items before planner items', () => {
        const service = new SkillExecutorService();

        const basePlan = {
            id: 'plan-1',
            goal: 'goal',
            status: 'executing' as const,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            items: [
                {
                    id: 'planner-step-1',
                    description: 'Planner step',
                    status: 'pending' as const,
                    type: 'general' as const
                }
            ]
        };

        const runtimePlan = {
            ...basePlan,
            id: 'runtime-plan',
            items: [
                {
                    id: 'skill-step-1',
                    description: 'Skill step',
                    status: 'pending' as const,
                    type: 'general' as const
                }
            ]
        };

        const merged = service.prependRuntimePlan(basePlan, runtimePlan);

        expect(merged.items.map((item) => item.id)).toEqual(['skill-step-1', 'planner-step-1']);
    });
});
