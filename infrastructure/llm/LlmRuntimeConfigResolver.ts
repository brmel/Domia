import { inject, injectable } from 'tsyringe';
import type { AiConfigProvider } from '@shared/contracts/config';

interface LLMConfig {
    readonly provider: 'google';
    readonly model: string;
    readonly apiKey?: string;
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

        return {
            provider: 'google',
            model,
            ...(apiKey ? { apiKey } : {})
        };
    }
}
