import { injectable, inject } from 'tsyringe';
import { Gemini, type BaseLlm } from '@google/adk';
import type { IAdkLlmFactory, AdkLlmFactoryInput } from './IAdkLlmFactory';
import type { IRetryPolicy } from '@domain/ports/agent/IRetryPolicy';
import { withLlmRetry } from './withLlmRetry';

@injectable()
export class GeminiLlmFactory implements IAdkLlmFactory {
    constructor(@inject('IRetryPolicy') private readonly retry: IRetryPolicy) {}

    create(input: AdkLlmFactoryInput): BaseLlm {
        return withLlmRetry(this.buildLlm(input), this.retry);
    }

    private buildLlm(input: AdkLlmFactoryInput): BaseLlm {
        const { auth } = input;
        switch (auth.mode) {
            case 'api_key':
                return new Gemini({ model: input.model, apiKey: auth.apiKey });
            case 'adc':
                return new Gemini({ model: input.model, vertexai: true, project: auth.project, location: auth.location });
            case 'none':
                throw new Error(auth.reason);
        }
    }
}
