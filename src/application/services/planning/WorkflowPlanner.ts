import { injectable, inject } from 'tsyringe';
import { Result, ok, err } from 'neverthrow';
import type { ILLMProvider } from '@domain/ports';
import { Plan } from '@domain/entities/Plan';
import { AssertionGoalService } from '../assertion/AssertionGoalService';
import { nanoid } from 'nanoid';

@injectable()
export class WorkflowPlanner {
    constructor(
        @inject('ILLMProvider') private llmProvider: ILLMProvider,
        @inject(AssertionGoalService) private readonly assertionGoalService: AssertionGoalService
    ) { }

    async plan(prompt: string): Promise<Result<Plan, Error>> {
        const deterministicPlan = this.assertionGoalService.createDeterministicPlan(prompt);
        if (deterministicPlan) {
            return ok(deterministicPlan);
        }

        const checklistPlan = this.createChecklistPlan(prompt);
        if (checklistPlan) {
            return ok(checklistPlan);
        }

        const result = await this.llmProvider.generatePlan(prompt);
        if (result.isOk()) {
            return ok(result.value);
        } else {
            return err(result.error);
        }
    }

    private createChecklistPlan(prompt: string): Plan | null {
        const lines = prompt
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (lines.length < 2) {
            return null;
        }

        const checklistItems = lines
            .map((line) => line.match(/^\s*(?:[-*•○]|\d+[.)])\s+(.*)$/)?.[1]?.trim())
            .filter((line): line is string => Boolean(line && line.length > 0));

        if (checklistItems.length < 2) {
            return null;
        }

        const now = new Date();
        return {
            id: nanoid(),
            goal: lines[0] ?? prompt,
            status: 'planning',
            createdAt: now,
            updatedAt: now,
            items: checklistItems.map((description) => ({
                id: nanoid(),
                description,
                status: 'pending',
                type: 'general' as const,
                metadata: {
                    source: 'checklist'
                }
            }))
        };
    }
}
