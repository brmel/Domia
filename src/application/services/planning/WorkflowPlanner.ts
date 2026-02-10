import { injectable, inject } from 'tsyringe';
import { Result, ok, err } from 'neverthrow';
import type { ILLMProvider } from '@domain/ports';
import { Plan } from '@domain/entities/Plan';

@injectable()
export class WorkflowPlanner {
    constructor(
        @inject('ILLMProvider') private llmProvider: ILLMProvider
    ) { }

    async plan(prompt: string): Promise<Result<Plan, Error>> {
        const result = await this.llmProvider.generatePlan(prompt);
        if (result.isOk()) {
            return ok(result.value);
        } else {
            return err(result.error);
        }
    }
}
