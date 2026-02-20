import { inject, injectable } from 'tsyringe';
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import type {
    IToolCallingProvider,
    ToolCallingRequest,
    ToolCallingResult,
    ToolCallingOutcome,
    ToolCallingFailure,
    ToolCallingFailureCode,
    ILogger
} from '@domain/ports';
import { LLMError } from '@domain/errors';
import { isTransientLlmToolCallingError } from '@shared/reliability/retryProfiles';
import type { ZodTypeAny } from 'zod';
import { LangChainModelFactory } from './LangChainModelFactory';
import { LlmRuntimeConfigResolver } from './LlmRuntimeConfigResolver';

@injectable()
export class LangChainToolCallingProvider implements IToolCallingProvider {
    constructor(
        @inject('ILogger') private readonly logger: ILogger,
        @inject(LlmRuntimeConfigResolver) private readonly runtimeConfig: LlmRuntimeConfigResolver,
        @inject(LangChainModelFactory) private readonly modelFactory: LangChainModelFactory,
    ) {}

    async generateToolCall(request: ToolCallingRequest): Promise<ToolCallingResult> {
        const outcome = await this.generateToolCallOutcome(request);
        if (outcome.ok) {
            return outcome.result;
        }

        throw new LLMError(outcome.failure.message);
    }

    async generateToolCallOutcome(request: ToolCallingRequest): Promise<ToolCallingOutcome> {
        try {
            const result = await this.generateToolCallOnce(request);
            return { ok: true, result };
        } catch (error) {
            const failure = this.classifyFailure(error);
            return { ok: false, failure };
        }
    }

    private async generateToolCallOnce(request: ToolCallingRequest): Promise<ToolCallingResult> {
        const runtime = this.runtimeConfig.resolve();
        const model = this.modelFactory.createToolCallingModel(runtime);
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
        const bindToolsCandidate = (model as { bindTools?: unknown }).bindTools;
        if (typeof bindToolsCandidate !== 'function') {
            throw new LLMError('Selected model does not support tool calling.');
        }
        const llmWithTools = (model as {
            bindTools: (tools: Array<{ name: string; description: string; schema: ZodTypeAny }>) => { invoke: (messages: BaseMessage[]) => Promise<unknown> }
        }).bindTools([...toolDefinitions]);
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

    private classifyFailure(error: unknown): ToolCallingFailure {
        const message = error instanceof Error ? error.message : String(error);
        const lowerMessage = message.toLowerCase();

        const code = this.resolveFailureCode(lowerMessage);
        const recoverable = this.isRecoverable(code);
        const retryable = this.isRetryable(code);

        this.logger.warn('[LangChainToolCallingProvider] Tool calling failed', {
            code,
            recoverable,
            retryable,
            message
        });

        return {
            code,
            message,
            recoverable,
            retryable
        };
    }

    private resolveFailureCode(message: string): ToolCallingFailureCode {
        if (message.includes('no valid tool schemas')) {
            return 'no_valid_tool_schema';
        }

        if (message.includes('does not support tool calling')) {
            return 'model_no_tool_support';
        }

        if (message.includes('did not return any tool call')) {
            return 'no_tool_call';
        }

        if (message.includes('did not include a valid name')) {
            return 'invalid_tool_name';
        }

        if (message.includes('referenced unknown tool')) {
            return 'unknown_tool';
        }

        if (message.includes('failed schema validation') || message.includes('missing or invalid object')) {
            return 'invalid_tool_args';
        }

        if (isTransientLlmToolCallingError(message)) {
            return 'provider_transient';
        }

        return 'provider_unknown';
    }

    private isRecoverable(code: ToolCallingFailureCode): boolean {
        switch (code) {
            case 'no_valid_tool_schema':
            case 'model_no_tool_support':
                return false;
            case 'no_tool_call':
            case 'invalid_tool_name':
            case 'unknown_tool':
            case 'invalid_tool_args':
            case 'provider_transient':
                return true;
            case 'provider_unknown':
                return false;
            default: {
                const exhaustiveCheck: never = code;
                return exhaustiveCheck;
            }
        }
    }

    private isRetryable(code: ToolCallingFailureCode): boolean {
        switch (code) {
            case 'no_tool_call':
            case 'invalid_tool_name':
            case 'unknown_tool':
            case 'invalid_tool_args':
            case 'provider_transient':
                return true;
            case 'no_valid_tool_schema':
            case 'model_no_tool_support':
            case 'provider_unknown':
                return false;
            default: {
                const exhaustiveCheck: never = code;
                return exhaustiveCheck;
            }
        }
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
