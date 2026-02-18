export interface ToolCallDefinition {
    readonly name: string;
    readonly description: string;
    readonly schema: unknown;
}

export interface ToolCallingRequest {
    readonly systemPrompt: string;
    readonly userPrompt: string;
    readonly tools: readonly ToolCallDefinition[];
    readonly imagesBase64?: readonly string[];
    readonly correctionError?: string;
}

export interface ToolCallingResult {
    readonly name: string;
    readonly args: Record<string, unknown>;
}

export type ToolCallingFailureCode =
    | 'no_valid_tool_schema'
    | 'model_no_tool_support'
    | 'no_tool_call'
    | 'invalid_tool_name'
    | 'unknown_tool'
    | 'invalid_tool_args'
    | 'provider_transient'
    | 'provider_unknown';

export interface ToolCallingFailure {
    readonly code: ToolCallingFailureCode;
    readonly message: string;
    readonly recoverable: boolean;
    readonly retryable: boolean;
}

export type ToolCallingOutcome =
    | { readonly ok: true; readonly result: ToolCallingResult }
    | { readonly ok: false; readonly failure: ToolCallingFailure };

export interface IToolCallingProvider {
    generateToolCallOutcome(request: ToolCallingRequest): Promise<ToolCallingOutcome>;
    generateToolCall(request: ToolCallingRequest): Promise<ToolCallingResult>;
}
