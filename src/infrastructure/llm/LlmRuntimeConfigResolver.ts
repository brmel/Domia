import { inject, injectable } from 'tsyringe';
import type { IConfigService } from '@domain/ports';

export interface LLMConfig {
    readonly provider: 'google';
    readonly model: string;
    readonly apiKey?: string;
}

@injectable()
export class LlmRuntimeConfigResolver {
    constructor(
        @inject('IConfigService') private readonly configService: IConfigService
    ) {}

    resolve(): LLMConfig {
        const config = this.configService.get();

        const model = process.env['DOMIA_LLM_MODEL'] || config.ai.model;

        const apiKey = process.env['DOMIA_LLM_API_KEY']
            || process.env['GOOGLE_API_KEY']
            || process.env['GEMINI_API_KEY']
            || config.ai.apiKey;

        return {
            provider: 'google',
            model,
            ...(apiKey ? { apiKey } : {})
        };
    }
}
