import { injectable, inject } from 'tsyringe';
import type { IBrowserAutomation, IPerceptionPipeline, IStorageService, ITraceService, ILogger } from '@domain/ports';
import type { AgentAction } from '@domain/value-objects';
import { LlmRuntimeConfigResolver } from '@infrastructure/adapters/llm/LlmRuntimeConfigResolver';
import { AdkStepRunner } from '@infrastructure/adapters/adk/AdkStepRunner';

export type StepExecutionResult =
    | { readonly success: true; readonly terminal: 'pass' }
    | {
        readonly success: false;
        readonly terminal: 'fail' | 'error' | 'max_actions';
        readonly code:
        | 'assertion_fail'
        | 'perception_error'
        | 'llm_error'
        | 'loop_detected'
        | 'action_execution_error'
        | 'agent_fail'
        | 'max_actions_reached';
        readonly reason: string;
    };

@injectable()
export class StepExecutor {
    constructor(
        @inject('IPerceptionPipeline') private readonly perception: IPerceptionPipeline,
        @inject('IStorageService') private readonly storage: IStorageService,
        @inject('ITraceService') private readonly trace: ITraceService,
        @inject('ILogger') private readonly logger: ILogger,
        @inject(LlmRuntimeConfigResolver) private readonly llmConfigResolver: LlmRuntimeConfigResolver,
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
    ): AsyncGenerator<{ type: 'action'; action: AgentAction; assets?: Record<string, string> }, StepExecutionResult, unknown> {
        const llmConfig = this.llmConfigResolver.resolve();
        const apiKey = llmConfig.apiKey;

        if (!apiKey) {
            return {
                success: false,
                terminal: 'error',
                code: 'llm_error',
                reason: 'No API key configured. Set GOOGLE_API_KEY, GEMINI_API_KEY, or DOMIA_LLM_API_KEY.',
            };
        }

        const model = llmConfig.model || 'gemini-2.0-flash';
        const storage = this.storage;

        const adkRunner = new AdkStepRunner({
            runId,
            stepGoal,
            browser,
            perception: this.perception,
            url,
            apiKey,
            model,
            maxActions: options.maxActions,
            vision: options.vision as boolean,
            logger: this.logger,
            saveAssets: async (stepNumber, frame) => {
                return storage.savePerceptionAssets(runId, stepNumber, frame);
            },
        });

        await this.trace.startTrace(runId);
        return yield* adkRunner.run();
    }
}
