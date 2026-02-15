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
import type { ZodTypeAny } from 'zod';

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

        const toolDefinitions = this.mapTools(request);
        if (toolDefinitions.length === 0) {
            throw new LLMError('No valid tool schemas were provided for tool calling.');
        }
        const llmWithTools = this.model.bindTools([...toolDefinitions]);
        const response = await llmWithTools.invoke(messages);
        return this.parseResponse(response, new Map(toolDefinitions.map(tool => [tool.name, tool.schema])));
    }

    private mapTools(request: ToolCallingRequest): ReadonlyArray<{ name: string; description: string; schema: ZodTypeAny }> {
        const mapped: Array<{ name: string; description: string; schema: ZodTypeAny }> = [];

        for (const tool of request.tools) {
            if (!this.isZodSchema(tool.schema)) {
                continue;
            }

            mapped.push({
                name: tool.name,
                description: tool.description,
                schema: tool.schema
            });
        }

        return mapped;
    }

    private parseResponse(
        response: unknown,
        toolSchemas: ReadonlyMap<string, ZodTypeAny>
    ): ToolCallingResult {
        const toolCalls = this.readToolCalls(response);

        if (toolCalls.length === 0) {
            throw new LLMError('Model did not return any tool call.');
        }

        const firstCall = toolCalls[0];
        if (!firstCall || typeof firstCall.name !== 'string' || firstCall.name.length === 0) {
            throw new LLMError('Tool call did not include a valid name.');
        }

        const schema = toolSchemas.get(firstCall.name);
        if (!schema) {
            throw new LLMError(`Tool call referenced unknown tool: ${firstCall.name}`);
        }

        const args = this.toArgsRecord(firstCall.args);
        const validation = schema.safeParse(args);
        if (!validation.success) {
            throw new LLMError(`Tool call '${firstCall.name}' arguments failed schema validation: ${validation.error.message}`);
        }

        return { name: firstCall.name, args: validation.data as Record<string, unknown> };
    }

    private readToolCalls(response: unknown): ReadonlyArray<{ name?: unknown; args?: unknown }> {
        if (!response || typeof response !== 'object' || !("tool_calls" in response)) {
            return [];
        }

        const toolCalls = (response as { tool_calls?: unknown }).tool_calls;
        if (!Array.isArray(toolCalls)) {
            return [];
        }

        return toolCalls as ReadonlyArray<{ name?: unknown; args?: unknown }>;
    }

    private toArgsRecord(args: unknown): Record<string, unknown> {
        if (!args || typeof args !== 'object' || Array.isArray(args)) {
            this.logger.warn('[LangChainToolCallingProvider] Tool call args were missing or invalid object; defaulting to empty args.');
            return {};
        }

        return args as Record<string, unknown>;
    }

    private isZodSchema(schema: unknown): schema is ZodTypeAny {
        return typeof schema === 'object'
            && schema !== null
            && 'safeParse' in schema
            && typeof (schema as { safeParse?: unknown }).safeParse === 'function';
    }
}
