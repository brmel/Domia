
import { ZodSchema } from 'zod';
import { ResultAsync } from 'neverthrow';
import { IBrowserAutomation, ILogger, IExecutionController } from '../ports';

/**
 * Context passed to every tool execution.
 * Allows tools to access shared resources like the browser, logger, etc.
 */
export interface ToolContext {
    browser?: IBrowserAutomation;
    logger?: ILogger;
    controller?: IExecutionController;
}

export interface Tool<TParams = unknown, TResult = unknown> {
    readonly name: string;
    readonly description: string;
    readonly schema: ZodSchema<TParams>;

    execute(params: TParams, context: ToolContext): ResultAsync<TResult, Error>;
}
