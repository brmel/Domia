import { injectable, inject } from 'tsyringe';
import type { IStructuredAutomation, ITraceService, IStorageService, ILogger } from '@domain/ports';
import type { IAgentRunner, StepExecutionResult } from '@domain/ports/IAgentRunner';
import type { AgentAction } from '@domain/value-objects';

export type { StepExecutionResult } from '@domain/ports/IAgentRunner';

export interface AgentActionEvent {
    readonly type: 'action';
    readonly action: AgentAction;
}

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
        automation: IStructuredAutomation,
        url: string,
        options: {
            vision: boolean;
            maxActions: number;
            maxElements?: number;
            [key: string]: unknown;
        } = { vision: true, maxActions: 20 },
    ): AsyncGenerator<AgentActionEvent, StepExecutionResult, unknown> {
        await this.trace.startTrace(runId);

        const gen = this.agentRunner.executeStep(
            { runId, stepGoal, url, maxActions: options.maxActions, maxElements: options.maxElements ?? 50, vision: options.vision },
            automation,
        );

        let next = await gen.next();
        while (!next.done) {
            const event = next.value;

            try {
                await this.storage.saveStepTrace(runId, event.actionIndex, event.trace);
            } catch {
                this.logger.warn(`[StepExecutor] Failed to save step trace for action ${event.actionIndex}`);
            }

            yield { type: 'action', action: event.action };

            next = await gen.next();
        }

        return next.value;
    }
}
