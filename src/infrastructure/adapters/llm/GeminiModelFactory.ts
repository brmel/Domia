import { injectable } from 'tsyringe';
import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import type { LLMConfig } from '@domain/ports';
import { LLMError } from '@domain/errors';

@injectable()
export class GeminiModelFactory {
    createModel(config: LLMConfig): GenerativeModel {
        return this.build(config);
    }

    createPlanningModel(config: LLMConfig): GenerativeModel {
        return this.build(config);
    }

    describe(config: LLMConfig): string {
        return config.baseUrl
            ? `${config.provider}/${config.model}@${config.baseUrl}`
            : `${config.provider}/${config.model}`;
    }

    private build(config: LLMConfig): GenerativeModel {
        if (config.provider !== 'google') {
            throw new LLMError(`Unsupported provider: ${config.provider}. Only Google/Gemini is supported.`);
        }

        if (!config.apiKey) {
            throw new LLMError('Missing Google API key. Set GOOGLE_API_KEY.');
        }

        const genAI = new GoogleGenerativeAI(config.apiKey);

        return genAI.getGenerativeModel({
            model: config.model,
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 2048,
            },
        });
    }
}
