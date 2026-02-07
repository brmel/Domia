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
            this.doGenerateAction(context),
            (e) => new LLMError(`LangChain generation failed: ${String(e)}`)
        ).andThen((text) => LLMPromptUtils.parseAction(text));
    }

    private async doGenerateAction(context: LLMContext): Promise<string> {
        // Construct the prompt using LangChain's template structure
        // We reuse LLMPromptUtils for the content to ensure zero regression in behavior
        const prompt = ChatPromptTemplate.fromMessages([
            ["system", LLMPromptUtils.systemPrompt],
            ["user", "{user_context}"]
        ]);

        const chain = prompt.pipe(this.model).pipe(new StringOutputParser());

        const userContext = LLMPromptUtils.buildUserPrompt(context);

        this.logger.debug(`[LangChainAdapter] Invoking chain with context length: ${userContext.length}`);

        const response = await chain.invoke({
            user_context: userContext
        });

        this.logger.debug(`[LangChainAdapter] Response length: ${response.length}`);
        return response;
    }
}
