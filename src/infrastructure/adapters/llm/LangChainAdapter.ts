import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { SystemMessage, HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import type { ILLMProvider, LLMContext, ILogger, LLMConfig, IConfigService } from '@domain/ports';
import type { AgentAction } from '@domain/value-objects';
import { LLMError } from '@domain/errors';
import { LLMPromptUtils } from './LLMPromptUtils';
import { LLMPlanningUtils } from './LLMPlanningUtils';

@injectable()
export class LangChainAdapter implements ILLMProvider {
    readonly providerName: string;
    private readonly model: ChatGoogleGenerativeAI;

    constructor(
        @inject('LLMConfig') config: LLMConfig,
        @inject('ILogger') private readonly logger: ILogger,
        @inject('IConfigService') private readonly configService: IConfigService
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
                    this.logger.debug(`[LangChainAdapter] invalid response payload: ${responseText.substring(0, 800)}`);
                }
            } catch (e: unknown) {
                const errorMessage = e instanceof Error ? e.message : String(e);
                const error = new LLMError(`Generation failed: ${errorMessage}`);
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
        // No need to escape for templates anymore
        const systemPrompt = LLMPromptUtils.systemPrompt;

        const messages: BaseMessage[] = [
            new SystemMessage(systemPrompt),
        ];

        const promptText = LLMPromptUtils.buildUserPrompt(context);
        const config = this.configService.get();
        const isVisionEnabled = config.ai.visionEnabled;

        if (isVisionEnabled && (context.snapshot.screenshots?.length || context.snapshot.screenshot)) {
            // Multimodal Message
            const content: any[] = [{ type: "text", text: promptText }];

            // Prioritize array, fallback to single
            const images = context.snapshot.screenshots?.length
                ? context.snapshot.screenshots
                : (context.snapshot.screenshot ? [context.snapshot.screenshot] : []);

            // Limit to 3 images as requested
            const imagesToSend = images.slice(0, 3);

            for (const imgBase64 of imagesToSend) {
                content.push({
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${imgBase64}`
                    }
                });
            }

            messages.push(new HumanMessage({ content }));
        } else {
            // Text-only Message
            messages.push(new HumanMessage(promptText));
        }

        if (correction) {
            messages.push(new AIMessage(correction.lastResponse));
            messages.push(new HumanMessage(`SYSTEM: Your last response was invalid. Error: ${correction.error}.\nYou MUST correct it and provide valid JSON matching the schema.`));
        }

        this.logger.debug(`[LangChainAdapter] Invoking model directly. Correction active: ${!!correction}`);

        const response = await this.model.invoke(messages);

        let content = '';
        if (typeof response.content === 'string') {
            content = response.content;
        } else if (Array.isArray(response.content)) {
            // Handle multimodal content if it ever happens (mostly string for now)
            content = response.content.map(c => {
                if ('text' in c) return c.text;
                return '';
            }).join('');
        }

        this.logger.debug(`[LangChainAdapter] Response length: ${content.length}`);
        return content;
    }
    generatePlan(prompt: string): ResultAsync<import('@domain/entities/Plan').Plan, LLMError> {
        return ResultAsync.fromPromise(
            this.doGeneratePlan(prompt),
            (e) => e instanceof LLMError ? e : new LLMError(`Plan generation failed: ${String(e)}`)
        );
    }

    private async doGeneratePlan(prompt: string): Promise<import('@domain/entities/Plan').Plan> {
        const messages: BaseMessage[] = [
            new SystemMessage(LLMPlanningUtils.systemPrompt),
            new HumanMessage(`User Request: "${prompt}"`)
        ];

        const response = await this.model.invoke(messages);
        let content = '';
        if (typeof response.content === 'string') {
            content = response.content;
        } else if (Array.isArray(response.content)) {
            content = response.content.map(c => ('text' in c ? c.text : '')).join('');
        }

        const result = LLMPlanningUtils.parsePlan(content);
        if (result.isErr()) {
            throw new LLMError(result.error.message);
        }
        return result.value;
    }
}
