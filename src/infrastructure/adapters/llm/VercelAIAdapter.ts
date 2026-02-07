import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { ILLMProvider, LLMContext } from '@domain/ports';
import type { AgentAction } from '@domain/value-objects';
import { LLMError } from '@domain/errors';
import { LLMPromptUtils } from './LLMPromptUtils';

export interface LLMConfig {
    readonly provider: 'openai' | 'anthropic' | 'google';
    readonly model: string;
    readonly apiKey: string;
}

/**
 * VercelAIAdapter - Implements ILLMProvider using @vercel/ai SDK
 */
@injectable()
export class VercelAIAdapter implements ILLMProvider {
    readonly providerName: string;
    private readonly config: LLMConfig;

    constructor(@inject('LLMConfig') config: LLMConfig) {
        this.config = config;
        this.providerName = `${config.provider}/${config.model}`;
    }

    generateAction(context: LLMContext): ResultAsync<AgentAction, LLMError> {
        return ResultAsync.fromPromise(
            this.doGenerateAction(context),
            (e) => new LLMError(`LLM generation failed: ${String(e)}`)
        ).andThen((text) => LLMPromptUtils.parseAction(text));
    }

    private async doGenerateAction(context: LLMContext): Promise<string> {
        const model = this.getModel();
        const userPrompt = LLMPromptUtils.buildUserPrompt(context);
        const systemPrompt = LLMPromptUtils.systemPrompt;

        const fullPrompt = this.config.provider === 'google'
            ? `${systemPrompt}\n\n---\n\n${userPrompt}`
            : userPrompt;

        const result = await generateText({
            model,
            ...(this.config.provider !== 'google' && systemPrompt ? { system: systemPrompt } : {}),
            prompt: fullPrompt,
            maxTokens: 1024,
            temperature: 0.7,
        });

        return result.text;
    }

    private getModel() {
        switch (this.config.provider) {
            case 'openai':
                return createOpenAI({ apiKey: this.config.apiKey })(this.config.model);
            case 'anthropic':
                return createAnthropic({ apiKey: this.config.apiKey })(this.config.model);
            case 'google':
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return createGoogleGenerativeAI({ apiKey: this.config.apiKey })(this.config.model) as any;
            default:
                throw new Error(`Unsupported provider: ${this.config.provider}`);
        }
    }
}
