import { injectable, inject } from 'tsyringe';
import type { IStructuredAutomation, ITraceService, IStorageService, ILogger } from '@domain/ports';
import type { IAgentRunner, StepExecutionResult } from '@domain/ports/IAgentRunner';
import type { AgentAction } from '@domain/value-objects';
import { DEFAULT_MAX_ACTIONS } from '@shared/defaults';

export type { StepExecutionResult } from '@domain/ports/IAgentRunner';

export type AgentActionEvent =
    | { readonly type: 'action'; readonly action: AgentAction }
    | { readonly type: 'thinking_chunk'; readonly text: string }
    | { readonly type: 'screenshot'; readonly data: string };

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
            platform?: import('@domain/types/PlatformConfig').PlatformType | undefined;
            [key: string]: unknown;
        } = { vision: true, maxActions: DEFAULT_MAX_ACTIONS },
    ): AsyncGenerator<AgentActionEvent, StepExecutionResult, unknown> {
        await this.trace.startTrace(runId);

        const rec = options['recording'] as { enabled: boolean; maxDurationMs?: number; intervalMs?: number } | undefined;
        const extras = options['extras'] as Readonly<Record<string, unknown>> | undefined;
        const config: import('@domain/ports/IAgentRunner').StepRunnerConfig = {
            runId,
            stepGoal,
            url,
            maxActions: options.maxActions,
            vision: options.vision,
            platform: options.platform as import('@domain/types/PlatformConfig').PlatformType | undefined,
            ...(extras ? { extras } : {}),
        };
        if (rec) {
            (config as { recording: typeof rec }).recording = rec;
        }
        const gen = this.agentRunner.executeStep(config, automation);

        let next = await gen.next();
        while (!next.done) {
            const event = next.value;

            if (event.type === 'thinking_chunk') {
                yield { type: 'thinking_chunk', text: event.text };
            } else if (event.type === 'screenshot') {
                yield { type: 'screenshot', data: event.data };
            } else {
                try {
                    await this.storage.saveStepTrace(runId, event.actionIndex, event.trace);
                } catch {
                    this.logger.warn(`[StepExecutor] Failed to save step trace for action ${event.actionIndex}`);
                }
                yield { type: 'action', action: event.action };
            }

            next = await gen.next();
        }

        return next.value;
    }
}
