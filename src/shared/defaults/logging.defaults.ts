/**
 * Centralized defaults for logging and debugging.
 */

/** Maximum context JSON length before truncation in ConsoleLogger. */
export const MAX_LOG_CONTEXT_LENGTH = 4096;

/** Max characters logged for ADK final responses. */
export const FINAL_RESPONSE_LOG_CHARS = 200;

/** Tool execution time threshold (ms) for split LLM/tool logging. */
export const TOOL_TIME_LOG_THRESHOLD_MS = 1000;
