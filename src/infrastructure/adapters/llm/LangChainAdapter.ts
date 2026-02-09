import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import type { ILLMProvider, LLMContext, ILogger, LLMConfig } from '@domain/ports';
import type { AgentAction } from '@domain/value-objects';
import { LLMError } from '@domain/errors';
import { LLMPromptUtils } from './LLMPromptUtils';

@injectable()
export class LangChainAdapter implements ILLMProvider {
    readonly providerName: string;
    private readonly model: ChatGoogleGenerativeAI;

    constructor(
        @inject('LLMConfig') config: LLMConfig,
        @inject('ILogger') private readonly logger: ILogger
    ) {
        this.model = new ChatGoogleGenerativeAI({
            model: config.model,
            apiKey: config.apiKey,
            maxOutputTokens: 2048,
            temperature: 0.1,
        });
        this.providerName = `langchain/google/${config.model}`;
    }

    generateAction(context: LLMContext): ResultAsync<AgentAction, LLMError> {
        return ResultAsync.fromPromise(
            this.generateWithRetry(context),
            (e) => e instanceof LLMError ? e : new LLMError(`Generation failed: ${String(e)}`)
        );
    }

    private async generateWithRetry(context: LLMContext, retries = 3): Promise<AgentAction> {
        let lastError: LLMError | undefined;
        let correctionContext: { error: string; lastResponse: string } | undefined;

        for (let i = 0; i < retries; i++) {
            try {
                const responseText = await this.doGenerateAction(context, correctionContext);

                const result = await LLMPromptUtils.parseAction(responseText, context);

                if (result.isOk()) {
                    return result.value;
                } else {
                    lastError = result.error;
                    correctionContext = {
                        error: lastError.message,
                        lastResponse: responseText
                    };
                    this.logger.warn(`[LangChainAdapter] validation failed (attempt ${i + 1}/${retries}): ${lastError.message}`);
                }
            } catch (e: any) {
                const error = new LLMError(`Generation failed: ${e.message}`);
                this.logger.error(`[LangChainAdapter] system error: ${error.message}`);

                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

                lastError = error;
            }
        }

        throw lastError || new LLMError("Failed to generate valid action after retries");
    }

    private async doGenerateAction(
        context: LLMContext,
        correction?: { error: string; lastResponse: string }
    ): Promise<string> {
        const systemPrompt = LLMPromptUtils.systemPrompt.replace(/{/g, '{{').replace(/}/g, '}}');

        const messages: (string | [string, string])[] = [
            ["system", systemPrompt],
            ["user", LLMPromptUtils.buildUserPrompt(context)]
        ];

        if (correction) {
            messages.push(["assistant", correction.lastResponse]);
            messages.push(["user", `SYSTEM: Your last response was invalid. Error: ${correction.error}.\nYou MUST correct it and provide valid JSON matching the schema.`]);
        }

        const prompt = ChatPromptTemplate.fromMessages(messages);
        const chain = prompt.pipe(this.model).pipe(new StringOutputParser());

        this.logger.debug(`[LangChainAdapter] Invoking chain. Correction active: ${!!correction}`);

        const response = await chain.invoke({});

        this.logger.debug(`[LangChainAdapter] Response length: ${response.length}`);
        return response;
    }
}
