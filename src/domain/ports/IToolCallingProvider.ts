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

export interface IToolCallingProvider {
    generateToolCall(request: ToolCallingRequest): Promise<ToolCallingResult>;
}
