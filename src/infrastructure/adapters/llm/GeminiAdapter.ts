import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ILLMProvider, LLMContext, ILogger } from '@domain/ports';
import type { AgentAction } from '@domain/value-objects';
import { LLMError } from '@domain/errors';
import type { LLMConfig } from './VercelAIAdapter';
import { LLMPromptUtils } from './LLMPromptUtils';

/**
 * GeminiAdapter - Native implementation using @google/generative-ai SDK
 */
@injectable()
export class GeminiAdapter implements ILLMProvider {
    readonly providerName: string;
    private readonly genAI: GoogleGenerativeAI;
    private readonly modelName: string;

    constructor(
        @inject('LLMConfig') config: LLMConfig,
        @inject('ILogger') private readonly logger: ILogger
    ) {
        this.genAI = new GoogleGenerativeAI(config.apiKey);
        this.modelName = config.model;
        this.providerName = `google/${config.model}`;
    }

    generateAction(context: LLMContext): ResultAsync<AgentAction, LLMError> {
        return ResultAsync.fromPromise(
            this.doGenerateAction(context),
            (e) => new LLMError(`LLM generation failed: ${String(e)}`)
        ).andThen((text) => LLMPromptUtils.parseAction(text));
    }

    private async doGenerateAction(context: LLMContext): Promise<string> {
        const model = this.genAI.getGenerativeModel({ model: this.modelName });
        const prompt = LLMPromptUtils.buildFullPrompt(context);

        this.logger.debug(`[GeminiAdapter] Sending prompt, length: ${prompt.length} characters`);

        const result = await model.generateContent(prompt);
        const text = result.response.text();

        this.logger.debug(`[GeminiAdapter] Response length: ${text?.length ?? 0}`);

        return text;
    }
}
