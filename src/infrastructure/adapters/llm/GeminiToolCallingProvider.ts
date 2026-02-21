import { inject, injectable } from 'tsyringe';
import { FunctionCallingMode } from '@google/generative-ai';
import type { Content, FunctionDeclaration, Part } from '@google/generative-ai';
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
import { LlmRuntimeConfigResolver } from './LlmRuntimeConfigResolver';
import { zodToGeminiSchema } from './zodToGeminiSchema';

@injectable()
export class GeminiToolCallingProvider implements IToolCallingProvider {
    constructor(
        @inject('ILogger') private readonly logger: ILogger,
        @inject(LlmRuntimeConfigResolver) private readonly runtimeConfig: LlmRuntimeConfigResolver,
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

        // Convert tool definitions from zod to Gemini format
        const functionDeclarations = this.mapTools(request);
        if (functionDeclarations.length === 0) {
            throw new LLMError('No valid tool schemas were provided for tool calling.');
        }

        const contents: Content[] = [];

        // Build model with system instruction + tools bound
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAIClient = new GoogleGenerativeAI(runtime.apiKey ?? '');
        const model = genAIClient.getGenerativeModel({
            model: runtime.model,
            systemInstruction: request.systemPrompt,
            tools: [{
                functionDeclarations
            }],
            toolConfig: {
                functionCallingConfig: {
                    mode: FunctionCallingMode.ANY
                }
            },
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 2048,
            },
        });

        // Build user message parts
        const userParts: Part[] = [{ text: request.userPrompt }];

        if (request.imagesBase64 && request.imagesBase64.length > 0) {
            for (const image of request.imagesBase64.slice(0, 3)) {
                userParts.push({
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: image
                    }
                });
            }
        }

        contents.push({ role: 'user', parts: userParts });

        // Add correction context if present
        if (request.correctionError) {
            contents.push({
                role: 'model',
                parts: [{ text: 'I will try again with a valid tool call.' }]
            });
            contents.push({
                role: 'user',
                parts: [{ text: `SYSTEM: Previous tool call was invalid. Error: ${request.correctionError}. You MUST call exactly one valid tool with valid arguments.` }]
            });
        }

        const response = await model.generateContent({ contents });
        return this.parseResponse(response, functionDeclarations);
    }

    private mapTools(request: ToolCallingRequest): FunctionDeclaration[] {
        const declarations: FunctionDeclaration[] = [];

        for (const tool of request.tools) {
            if (!this.isZodSchema(tool.schema)) {
                continue;
            }

            try {
                const parameters = zodToGeminiSchema(tool.schema as ZodTypeAny);
                declarations.push({
                    name: tool.name,
                    description: tool.description,
                    parameters
                });
            } catch {
                this.logger.warn('[GeminiToolCallingProvider] Failed to convert schema for tool', { tool: tool.name });
            }
        }

        return declarations;
    }

    private parseResponse(
        response: import('@google/generative-ai').GenerateContentResult,
        _declarations: FunctionDeclaration[]
    ): ToolCallingResult {
        const candidate = response.response.candidates?.[0];
        if (!candidate?.content?.parts) {
            throw new LLMError('Model did not return any content.');
        }

        const functionCallPart = candidate.content.parts.find(
            (part: Part) => 'functionCall' in part && part.functionCall
        );

        if (!functionCallPart || !('functionCall' in functionCallPart) || !functionCallPart.functionCall) {
            throw new LLMError('Model did not return any tool call.');
        }

        const { name, args } = functionCallPart.functionCall;
        if (!name || name.length === 0) {
            throw new LLMError('Tool call did not include a valid name.');
        }

        const argsRecord = this.toArgsRecord(args);
        return { name, args: argsRecord };
    }

    private classifyFailure(error: unknown): ToolCallingFailure {
        const message = error instanceof Error ? error.message : String(error);
        const lowerMessage = message.toLowerCase();

        const code = this.resolveFailureCode(lowerMessage);
        const recoverable = this.isRecoverable(code);
        const retryable = this.isRetryable(code);

        this.logger.warn('[GeminiToolCallingProvider] Tool calling failed', {
            code,
            recoverable,
            retryable,
            message
        });

        return { code, message, recoverable, retryable };
    }

    private resolveFailureCode(message: string): ToolCallingFailureCode {
        if (message.includes('no valid tool schemas')) return 'no_valid_tool_schema';
        if (message.includes('does not support tool calling')) return 'model_no_tool_support';
        if (message.includes('did not return any tool call') || message.includes('did not return any content')) return 'no_tool_call';
        if (message.includes('did not include a valid name')) return 'invalid_tool_name';
        if (message.includes('referenced unknown tool')) return 'unknown_tool';
        if (message.includes('failed schema validation') || message.includes('missing or invalid object')) return 'invalid_tool_args';
        if (isTransientLlmToolCallingError(message)) return 'provider_transient';
        return 'provider_unknown';
    }

    private isRecoverable(code: ToolCallingFailureCode): boolean {
        switch (code) {
            case 'no_valid_tool_schema':
            case 'model_no_tool_support':
            case 'provider_unknown':
                return false;
            case 'no_tool_call':
            case 'invalid_tool_name':
            case 'unknown_tool':
            case 'invalid_tool_args':
            case 'provider_transient':
                return true;
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

    private toArgsRecord(args: unknown): Record<string, unknown> {
        if (!args || typeof args !== 'object' || Array.isArray(args)) {
            this.logger.warn('[GeminiToolCallingProvider] Tool call args were missing or invalid object; defaulting to empty args.');
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
