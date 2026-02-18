import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { WorkflowPlanner } from './WorkflowPlanner';

describe('WorkflowPlanner', () => {
    it('creates a deterministic multi-step plan from explicit checklist prompts', async () => {
        const llmProvider = {
            generatePlan: vi.fn().mockResolvedValue(okAsync({
                id: 'llm-plan',
                goal: 'llm-goal',
                status: 'planning',
                createdAt: new Date(),
                updatedAt: new Date(),
                items: [{ id: 'llm-1', description: 'llm step', status: 'pending', type: 'general' as const }]
            }))
        };

        const assertionGoalService = {
            createDeterministicPlan: vi.fn().mockReturnValue(null)
        };

        const planner = new WorkflowPlanner(
            llmProvider as unknown as never,
            assertionGoalService as unknown as never
        );

        const prompt = [
            "Validate website multilingual support",
            "○ Navigate to the website's homepage.",
            '○ Locate the language selection element.',
            '○ Extract the list of supported languages from the language selection element.',
            '○ Count the number of supported languages.',
            '○ Check if Arabic, English, and French are present in the list of supported languages.',
            '○ Report the number of supported languages and whether Arabic, English, and French are supported.'
        ].join('\n');

        const result = await planner.plan(prompt);

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error('Expected checklist plan result');
        }

        expect(result.value.items.length).toBe(6);
        expect(result.value.items[0]?.description).toContain('Navigate to the website');
        expect(result.value.items[2]?.description).toContain('Extract the list of supported languages');
        expect(llmProvider.generatePlan).not.toHaveBeenCalled();
    });

    it('falls back to LLM planning when prompt is not a checklist', async () => {
        const llmPlan = {
            id: 'llm-plan',
            goal: 'goal',
            status: 'planning',
            createdAt: new Date(),
            updatedAt: new Date(),
            items: [{ id: 'llm-1', description: 'llm step', status: 'pending', type: 'general' as const }]
        };

        const llmProvider = {
            generatePlan: vi.fn().mockResolvedValue({
                isOk: () => true,
                isErr: () => false,
                value: llmPlan
            })
        };

        const assertionGoalService = {
            createDeterministicPlan: vi.fn().mockReturnValue(null)
        };

        const planner = new WorkflowPlanner(
            llmProvider as unknown as never,
            assertionGoalService as unknown as never
        );

        const result = await planner.plan('Open the page and verify the welcome title');

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error('Expected llm plan result');
        }
        expect(result.value.id).toBe('llm-plan');
        expect(llmProvider.generatePlan).toHaveBeenCalledTimes(1);
    });
});
