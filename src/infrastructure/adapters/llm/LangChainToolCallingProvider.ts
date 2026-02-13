import { inject, injectable } from 'tsyringe';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type {
    IToolCallingProvider,
    ToolCallingRequest,
    ToolCallingResult,
    LLMConfig,
    ILogger
} from '@domain/ports';
import { LLMError } from '@domain/errors';
import { retryAsync } from '@shared/reliability/retry';
import { RETRY_PROFILES, isTransientLlmToolCallingError } from '@shared/reliability/retryProfiles';

@injectable()
export class LangChainToolCallingProvider implements IToolCallingProvider {
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
    }

    async generateToolCall(request: ToolCallingRequest): Promise<ToolCallingResult> {
        return retryAsync(
            async () => this.generateToolCallOnce(request),
            {
                ...RETRY_PROFILES.llmToolCalling,
                shouldRetry: (error) => isTransientLlmToolCallingError(error),
                onRetry: (info) => {
                    const message = info.error instanceof Error ? info.error.message : String(info.error);
                    this.logger.warn(
                        `[LangChainToolCallingProvider] Retry ${info.attempt}/${info.maxAttempts - 1} after error: ${message}`
                    );
                }
            }
        );
    }

    private async generateToolCallOnce(request: ToolCallingRequest): Promise<ToolCallingResult> {
        const messages: BaseMessage[] = [new SystemMessage(request.systemPrompt)];

        if (request.imagesBase64 && request.imagesBase64.length > 0) {
            const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
                { type: 'text', text: request.userPrompt }
            ];

            for (const image of request.imagesBase64.slice(0, 3)) {
                content.push({
                    type: 'image_url',
                    image_url: {
                        url: `data:image/jpeg;base64,${image}`
                    }
                });
            }

            messages.push(new HumanMessage({ content }));
        } else {
            messages.push(new HumanMessage(request.userPrompt));
        }

        if (request.correctionError) {
            messages.push(new HumanMessage(
                `SYSTEM: Previous tool call was invalid. Error: ${request.correctionError}. You MUST call exactly one valid tool with valid arguments.`
            ));
        }

        const llmWithTools = this.model.bindTools(request.tools as any);
        const response = await llmWithTools.invoke(messages);
        const toolCalls = (response as { tool_calls?: unknown }).tool_calls;

        if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
            throw new LLMError('Model did not return any tool call.');
        }

        const firstCall = toolCalls[0] as { name?: string; args?: unknown } | undefined;
        if (!firstCall?.name) {
            throw new LLMError('Tool call did not include a valid name.');
        }

        if (!firstCall.args || typeof firstCall.args !== 'object' || Array.isArray(firstCall.args)) {
            this.logger.warn('[LangChainToolCallingProvider] Tool call args were missing or invalid object; defaulting to empty args.');
            return { name: firstCall.name, args: {} };
        }

        return { name: firstCall.name, args: firstCall.args as Record<string, unknown> };
    }
}
