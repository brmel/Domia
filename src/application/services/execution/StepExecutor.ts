import { injectable, inject } from 'tsyringe';
import type { IBrowserAutomation, ITraceService } from '@domain/ports';
import type { IAgentRunner, AgentActionEvent, StepExecutionResult } from '@domain/ports/IAgentRunner';

export type { StepExecutionResult } from '@domain/ports/IAgentRunner';

@injectable()
export class StepExecutor {
    constructor(
        @inject('IAgentRunner') private readonly agentRunner: IAgentRunner,
        @inject('ITraceService') private readonly trace: ITraceService,
    ) {}

    async *executeStep(
        runId: string,
        stepGoal: string,
        browser: IBrowserAutomation,
        url: string,
        _initialStepNumber: number = 0,
        options: {
            vision: boolean;
            maxActions: number;
            [key: string]: unknown;
        } = { vision: true, maxActions: 20 },
    ): AsyncGenerator<AgentActionEvent, StepExecutionResult, unknown> {
        await this.trace.startTrace(runId);

        return yield* this.agentRunner.executeStep(
            {
                runId,
                stepGoal,
                url,
                maxActions: options.maxActions,
                vision: options.vision,
            },
            browser,
        );
    }
}
