import { injectable, inject } from 'tsyringe';
import type { IPlanner } from '@domain/ports/agent/IPlanner';
import type { IPromptRenderer } from '@domain/ports/agent/IPromptService';
import { PromptKey } from '@domain/ports/agent/IPromptService';
import type { ILogger } from '@domain/ports';
import { DEFAULT_LLM_MODEL } from '@shared/defaults';
import { LlmRuntimeConfigResolver } from '@infrastructure/llm/LlmRuntimeConfigResolver';
import type { IAdkLlmFactory } from './IAdkLlmFactory';
import { generateText, stripJsonFences } from './adkOneShot';

const TAG = '[AdkPlanner]';
const MAX_ITEMS = 12;

/** LLM-backed IPlanner; falls back to [goal] on any failure or non-array output. */
@injectable()
export class AdkPlanner implements IPlanner {
    constructor(
        @inject('IAdkLlmFactory') private readonly llmFactory: IAdkLlmFactory,
        @inject(LlmRuntimeConfigResolver) private readonly llmConfig: LlmRuntimeConfigResolver,
        @inject('IPromptRenderer') private readonly prompts: IPromptRenderer,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    async decompose(goal: string): Promise<readonly string[]> {
        try {
            const cfg = this.llmConfig.resolve();
            const llm = this.llmFactory.create({ model: cfg.model || DEFAULT_LLM_MODEL, auth: cfg.auth });
            const prompt = this.prompts.renderPrompt(PromptKey.PlanDecomposition, { goal });
            const text = await generateText(llm, prompt);
            const parsed = JSON.parse(stripJsonFences(text)) as unknown;
            if (!Array.isArray(parsed)) return [goal];
            const items = parsed
                .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
                .slice(0, MAX_ITEMS);
            return items.length > 0 ? items : [goal];
        } catch (e) {
            this.logger.warn(`${TAG} planning unavailable, using single goal: ${e instanceof Error ? e.message : String(e)}`);
            return [goal];
        }
    }
}
