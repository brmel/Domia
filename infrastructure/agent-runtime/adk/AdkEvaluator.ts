import { injectable, inject } from 'tsyringe';
import type { IEvaluator, EvaluationVerdict } from '@domain/ports/agent/IEvaluator';
import type { IPromptRenderer } from '@domain/ports/agent/IPromptService';
import { PromptKey } from '@domain/ports/agent/IPromptService';
import type { ILogger } from '@domain/ports';
import { DEFAULT_LLM_MODEL } from '@shared/defaults';
import { LlmRuntimeConfigResolver } from '@infrastructure/llm/LlmRuntimeConfigResolver';
import type { IAdkLlmFactory } from './IAdkLlmFactory';
import { generateText, stripJsonFences } from './adkOneShot';

const TAG = '[AdkEvaluator]';

/** LLM-backed IEvaluator; degrades to satisfied:true on any failure so it never blocks a finish. */
@injectable()
export class AdkEvaluator implements IEvaluator {
    constructor(
        @inject('IAdkLlmFactory') private readonly llmFactory: IAdkLlmFactory,
        @inject(LlmRuntimeConfigResolver) private readonly llmConfig: LlmRuntimeConfigResolver,
        @inject('IPromptRenderer') private readonly prompts: IPromptRenderer,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    async evaluate(goal: string, resultSummary: string): Promise<EvaluationVerdict> {
        try {
            const cfg = this.llmConfig.resolve();
            const llm = this.llmFactory.create({ model: cfg.model || DEFAULT_LLM_MODEL, apiKey: cfg.apiKey });
            const prompt = this.prompts.renderPrompt(PromptKey.EvaluateGoal, { goal, resultSummary });
            const text = await generateText(llm, prompt);
            const parsed = JSON.parse(stripJsonFences(text)) as { satisfied?: unknown; reason?: unknown };
            return {
                satisfied: parsed.satisfied !== false,
                reason: typeof parsed.reason === 'string' ? parsed.reason : '',
            };
        } catch (e) {
            this.logger.warn(`${TAG} evaluation unavailable: ${e instanceof Error ? e.message : String(e)}`);
            return { satisfied: true, reason: 'evaluation unavailable' };
        }
    }
}
