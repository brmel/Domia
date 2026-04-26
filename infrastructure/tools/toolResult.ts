import type { Result } from 'neverthrow';
import type { ToolResult } from '@domain/types/ToolTypes';
import type { BuiltInPlatformType } from '@domain/types/PlatformConfig';

export const TOOL_SUCCESS = 'success' as const;
export const TOOL_ERROR = 'error' as const;

export const WEB_ELECTRON_PLATFORMS = ['web', 'electron'] as const satisfies readonly BuiltInPlatformType[];

export function toolSuccess(extra?: Record<string, unknown>): ToolResult {
    return extra ? { status: TOOL_SUCCESS, ...extra } : { status: TOOL_SUCCESS };
}

export function toolError(message: string): ToolResult {
    return { status: TOOL_ERROR, error: message };
}

export function unwrapResult(result: Result<unknown, { message: string }>, extra?: Record<string, unknown>): ToolResult {
    if (result.isErr()) return toolError(result.error.message);
    return toolSuccess(extra);
}

export function errorMsg(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
