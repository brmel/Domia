import { injectable, inject } from 'tsyringe';
import type { IAppAutomation, ITraceService, IStorageService, ILogger } from '@domain/ports';
import type { IAgentRunner, AgentActionEvent, StepExecutionResult } from '@domain/ports/IAgentRunner';

export type { StepExecutionResult } from '@domain/ports/IAgentRunner';

@injectable()
export class StepExecutor {
    constructor(
        @inject('IAgentRunner') private readonly agentRunner: IAgentRunner,
        @inject('ITraceService') private readonly trace: ITraceService,
        @inject('IStorageService') private readonly storage: IStorageService,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    async *executeStep(
        runId: string,
        stepGoal: string,
        browser: IAppAutomation,
        url: string,
        _initialStepNumber: number = 0,
        options: {
            vision: boolean;
            maxActions: number;
            [key: string]: unknown;
        } = { vision: true, maxActions: 20 },
    ): AsyncGenerator<AgentActionEvent, StepExecutionResult, unknown> {
        await this.trace.startTrace(runId);

        const gen = this.agentRunner.executeStep(
            { runId, stepGoal, url, maxActions: options.maxActions, vision: options.vision },
            browser,
        );

        let next = await gen.next();
        while (!next.done) {
            const event = next.value;

            let assets: Record<string, string> | undefined;
            if (event.capturedFrame) {
                try {
                    assets = await this.storage.savePerceptionAssets(runId, event.actionIndex, event.capturedFrame);
                } catch {
                    this.logger.warn(`[StepExecutor] Failed to save perception assets for action ${event.actionIndex}`);
                }
            }

            try {
                await this.storage.saveStepTrace(runId, event.actionIndex, event.trace);
            } catch {
                this.logger.warn(`[StepExecutor] Failed to save step trace for action ${event.actionIndex}`);
            }

            yield { type: 'action', action: event.action, assets };

            next = await gen.next();
        }

        return next.value;
    }
}
