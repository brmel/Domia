import { injectable, inject } from 'tsyringe';
import { Gemini, type BaseLlm } from '@google/adk';
import type { IAdkLlmFactory, AdkLlmFactoryInput } from './IAdkLlmFactory';
import type { IRetryPolicy } from '@domain/ports/agent/IRetryPolicy';
import { withLlmRetry } from './withLlmRetry';

@injectable()
export class GeminiLlmFactory implements IAdkLlmFactory {
    constructor(@inject('IRetryPolicy') private readonly retry: IRetryPolicy) {}

    create(input: AdkLlmFactoryInput): BaseLlm {
        if (!input.apiKey) {
            throw new Error('Gemini factory requires an API key. Set GOOGLE_API_KEY, GEMINI_API_KEY, or DOMIA_LLM_API_KEY.');
        }
        const llm = new Gemini({ model: input.model, apiKey: input.apiKey });
        return withLlmRetry(llm, this.retry);
    }
}
