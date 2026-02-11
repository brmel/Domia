
import { ZodSchema } from 'zod';
import { ResultAsync } from 'neverthrow';
import { ToolContext } from './Tool';

export interface ActionResult {
    success: boolean;
    data?: any;
    message?: string;
    error?: string;
}

/**
 * ToolDefinition
 * 
 * Describes a tool that can be executed by the Agent.
 * This replaces the hardcoded ActionType enum approach.
 */
export interface ToolDefinition<TParams = any> {
    /**
     * Unique name of the tool (e.g., "click_element", "scroll_page")
     */
    readonly name: string;

    /**
     * Description for the LLM to understand when to use this tool.
     */
    readonly description: string;

    /**
     * Zod schema for validation of parameters.
     */
    readonly schema: ZodSchema<TParams>;

    /**
     * Execution logic for this tool.
     */
    execute(params: TParams, context: ToolContext): ResultAsync<ActionResult, Error>;
}
