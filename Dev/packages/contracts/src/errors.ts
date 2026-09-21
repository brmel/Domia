import { err as nErr, ok as nOk, type Result } from 'neverthrow';
import type { ModuleId } from './ids.js';

export const ErrorCode = {
  // contract / could-not-start → carried by ModuleResult.Err (D2)
  BAD_CONFIG: 'BAD_CONFIG',
  INVALID_ARGS: 'INVALID_ARGS',
  UNKNOWN_TOOL: 'UNKNOWN_TOOL',
  TARGET_BUSY: 'TARGET_BUSY',
  TARGET_UNREACHABLE: 'TARGET_UNREACHABLE',
  PROVIDER_AUTH: 'PROVIDER_AUTH',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  RUN_NOT_LIVE: 'RUN_NOT_LIVE',
  NOT_FOUND: 'NOT_FOUND',
  EXTENSION_MISSING: 'EXTENSION_MISSING',
  EXTENSION_CONFLICT: 'EXTENSION_CONFLICT',
  ALREADY_DISPOSED: 'ALREADY_DISPOSED',
  IO: 'IO',
  // domain / ran-but-failed → carried by Outcome.failed (D2)
  TOOL_FAILED: 'TOOL_FAILED',
  TOOL_TIMEOUT: 'TOOL_TIMEOUT',
  AGENT_MALFORMED: 'AGENT_MALFORMED',
  MCP_SERVER_ERROR: 'MCP_SERVER_ERROR',
  CANCELLED: 'CANCELLED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface DomiaError {
  readonly code: ErrorCode;
  readonly module: ModuleId;
  /** Human, secret-free. */
  readonly message: string;
  readonly retryable: boolean;
  readonly cause?: unknown;
  readonly data?: Record<string, unknown>;
}

export type ModuleResult<T> = Result<T, DomiaError>;

export function domiaError(
  module: ModuleId,
  code: ErrorCode,
  message: string,
  extra?: Partial<Pick<DomiaError, 'retryable' | 'cause' | 'data'>>,
): DomiaError {
  return { code, module, message, retryable: extra?.retryable ?? false, ...(extra?.cause !== undefined ? { cause: extra.cause } : {}), ...(extra?.data !== undefined ? { data: extra.data } : {}) };
}

export const resultOk = nOk;
export const resultErr = nErr;
