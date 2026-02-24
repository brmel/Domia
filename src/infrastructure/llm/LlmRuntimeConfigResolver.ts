import { inject, injectable } from 'tsyringe';
import type { IConfigService } from '@domain/ports';

export interface LLMConfig {
    readonly provider: 'google' | 'openai' | 'anthropic' | (string & {});
    readonly model: string;
    readonly apiKey?: string;
    readonly baseUrl?: string;
}

@injectable()
export class LlmRuntimeConfigResolver {
    constructor(
        @inject('IConfigService') private readonly configService: IConfigService
    ) {}

    resolve(): LLMConfig {
        const config = this.configService.get();

        const providerOverride = process.env['DOMIA_LLM_PROVIDER'] as LLMConfig['provider'] | undefined;
        const provider = providerOverride || config.ai.provider;

        const model = process.env['DOMIA_LLM_MODEL'] || config.ai.model;

        const baseUrl = process.env['DOMIA_LLM_BASE_URL']
            || config.ai.baseUrl;

        const apiKey = process.env['DOMIA_LLM_API_KEY']
            || process.env['GOOGLE_API_KEY']
            || process.env['GEMINI_API_KEY']
            || config.ai.apiKey;

        return {
            provider,
            model,
            ...(apiKey ? { apiKey } : {}),
            ...(baseUrl ? { baseUrl } : {})
        };
    }
}
