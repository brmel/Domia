
import { ZodSchema } from 'zod';
import { ResultAsync } from 'neverthrow';
import { ToolContext } from './Tool';
import { ToolMetadata } from './ToolMetadata';

export interface ActionResult {
    success: boolean;
    data?: unknown;
    message?: string;
    error?: string;
    /** Terminal result signals test completion (pass/fail) */
    terminal?: boolean;
}

/**
 * ToolDefinition
 * 
 * Describes a tool that can be executed by the Agent.
 * Replaces the hardcoded ActionType enum with a flexible, platform-aware system.
 */
export interface ToolDefinition<TParams = unknown> {
    /**
     * Unique name of the tool (e.g., "click_element", "electron_menu_click")
     */
    readonly name: string;

    /**
     * Description for the LLM to understand when to use this tool
     */
    readonly description: string;

    /**
     * Zod schema for validation of parameters
     */
    readonly schema: ZodSchema<TParams>;

    /**
     * Tool metadata (platforms, scope, category, etc.)
     */
    readonly metadata: ToolMetadata;

    /**
     * Execution logic for this tool (can be platform-aware)
     */
    execute(params: TParams, context: ToolContext): ResultAsync<ActionResult, Error>;
}
