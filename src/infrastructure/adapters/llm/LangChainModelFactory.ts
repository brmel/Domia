import { injectable } from 'tsyringe';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import type { LLMConfig } from '@domain/ports';
import { LLMError } from '@domain/errors';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

@injectable()
export class LangChainModelFactory {
    createToolCallingModel(config: LLMConfig): BaseChatModel {
        return this.createModel(config);
    }

    createPlanningModel(config: LLMConfig): BaseChatModel {
        return this.createModel(config);
    }

    describe(config: LLMConfig): string {
        const provider = config.provider;
        const model = config.model;
        const baseUrl = config.baseUrl;

        if (baseUrl) {
            return `${provider}/${model}@${baseUrl}`;
        }

        return `${provider}/${model}`;
    }

    private createModel(config: LLMConfig): BaseChatModel {
        switch (config.provider) {
            case 'google': {
                if (!config.apiKey) {
                    throw new LLMError('Missing Google API key. Set GOOGLE_API_KEY or GEMINI_API_KEY.');
                }

                return new ChatGoogleGenerativeAI({
                    model: config.model,
                    apiKey: config.apiKey,
                    maxOutputTokens: 2048,
                    temperature: 0.1,
                });
            }
            case 'openai': {
                if (!config.apiKey) {
                    throw new LLMError('Missing OpenAI API key. Set OPENAI_API_KEY.');
                }

                return new ChatOpenAI({
                    model: config.model,
                    apiKey: config.apiKey,
                    ...(config.baseUrl ? { configuration: { baseURL: config.baseUrl } } : {}),
                    temperature: 0.1,
                });
            }
            case 'vllm': {
                const baseUrl = config.baseUrl || process.env['VLLM_BASE_URL'] || 'http://127.0.0.1:8000/v1';

                return new ChatOpenAI({
                    model: config.model,
                    apiKey: config.apiKey || 'vllm-local',
                    configuration: { baseURL: baseUrl },
                    temperature: 0.1,
                });
            }
            case 'anthropic': {
                throw new LLMError('Anthropic provider is configured but not yet implemented in LangChain runtime.');
            }
            default: {
                throw new LLMError(`Unsupported provider: ${String((config as { provider?: unknown }).provider)}`);
            }
        }
    }
}
