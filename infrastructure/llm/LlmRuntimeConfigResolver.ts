import { inject, injectable } from 'tsyringe';
import type { AiConfigProvider } from '@shared/contracts/config';
import { DEFAULT_THINKING_BUDGET } from '@shared/defaults';

interface LLMConfig {
    readonly provider: 'google';
    readonly model: string;
    readonly apiKey?: string;
    readonly thinkingBudget: number;
}

@injectable()
export class LlmRuntimeConfigResolver {
    constructor(
        @inject('AiConfigProvider') private readonly ai: AiConfigProvider
    ) {}

    resolve(): LLMConfig {
        const ai = this.ai();
        const model = process.env['DOMIA_LLM_MODEL'] || ai.model;

        const apiKey = process.env['DOMIA_LLM_API_KEY']
            || process.env['GOOGLE_API_KEY']
            || process.env['GEMINI_API_KEY']
            || ai.apiKey;

        const thinkingRaw = process.env['DOMIA_THINKING_BUDGET'];
        const parsed = thinkingRaw ? Number.parseInt(thinkingRaw, 10) : DEFAULT_THINKING_BUDGET;
        const thinkingBudget = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_THINKING_BUDGET;

        return {
            provider: 'google',
            model,
            thinkingBudget,
            ...(apiKey ? { apiKey } : {})
        };
    }
}
