
import { ZodSchema } from 'zod';
import { ResultAsync } from 'neverthrow';
import { ToolContext } from './Tool';
import { ToolMetadata } from './ToolMetadata';

export interface ActionResult {
    success: boolean;
    data?: unknown;
    message?: string;
    error?: string;
    terminal?: boolean;
}

export interface ToolDefinition<TParams = unknown> {
    readonly name: string;
    readonly description: string;
    readonly schema: ZodSchema<TParams>;
    readonly metadata: ToolMetadata;
    execute(params: TParams, context: ToolContext): ResultAsync<ActionResult, Error>;
}
