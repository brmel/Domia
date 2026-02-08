
import { ZodSchema } from 'zod';
import { ResultAsync } from 'neverthrow';
import { IBrowserAutomation, ILogger } from '../ports';

/**
 * Context passed to every tool execution.
 * Provides access to agent capabilities (Browser, FileSystem, etc.)
 */
export interface ToolContext {
    browser?: IBrowserAutomation;
    logger?: ILogger;
    workspaceRoot?: string;
    [key: string]: unknown;
}

export interface Tool<TParams = unknown, TResult = unknown> {
    readonly name: string;
    readonly description: string;
    readonly schema: ZodSchema<TParams>;

    execute(params: TParams, context: ToolContext): ResultAsync<TResult, Error>;
}
