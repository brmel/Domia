import { describe, expect, it } from 'vitest';
import { LLMPlanningUtils } from '@infrastructure/adapters/llm/LLMPlanningUtils';

describe('LLMPlanningUtils.parsePlan', () => {
    it('maps structured step contract fields when provided', () => {
        const result = LLMPlanningUtils.parsePlan(JSON.stringify({
            goal: 'Validate language selector',
            steps: [
                {
                    description: 'Open language menu',
                    type: 'browser',
                    objective: 'Expose all supported UI languages',
                    successCriteria: ['Language menu is visible'],
                    evidenceExpectations: ['Extracted language labels'],
                    constraints: ['Do not navigate away from settings']
                }
            ]
        }));

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }

        const [firstStep] = result.value.items;
        expect(firstStep?.contract?.objective).toBe('Expose all supported UI languages');
        expect(firstStep?.contract?.successCriteria).toEqual(['Language menu is visible']);
        expect(firstStep?.contract?.evidenceExpectations).toEqual(['Extracted language labels']);
        expect(firstStep?.contract?.constraints).toEqual(['Do not navigate away from settings']);
    });

    it('backfills contract objective when legacy step fields are used', () => {
        const result = LLMPlanningUtils.parsePlan(JSON.stringify({
            goal: 'Basic legacy plan',
            steps: [
                {
                    description: 'Click start button',
                    type: 'browser'
                }
            ]
        }));

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            return;
        }

        const [firstStep] = result.value.items;
        expect(firstStep?.contract?.objective).toBe('Click start button');
        expect(firstStep?.contract?.successCriteria).toEqual([]);
        expect(firstStep?.contract?.evidenceExpectations).toEqual([]);
        expect(firstStep?.contract?.constraints).toEqual([]);
    });
});
