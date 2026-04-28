import { injectable } from 'tsyringe';
import { Gemini, type BaseLlm } from '@google/adk';
import type { IAdkLlmFactory, AdkLlmFactoryInput } from './IAdkLlmFactory';

@injectable()
export class GeminiLlmFactory implements IAdkLlmFactory {
    create(input: AdkLlmFactoryInput): BaseLlm {
        if (!input.apiKey) {
            throw new Error('Gemini factory requires an API key. Set GOOGLE_API_KEY, GEMINI_API_KEY, or DOMIA_LLM_API_KEY.');
        }
        return new Gemini({ model: input.model, apiKey: input.apiKey });
    }
}
