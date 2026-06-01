import { LlmError, LlmRateLimitError, LlmServerError, LlmAuthError, LlmBadRequestError } from '@domain/errors';

/**
 * Translate a provider/SDK/transport error into the domain LLM taxonomy (W13).
 * The retry boundary then decides retry-vs-surface from `error.retryable` alone,
 * with no provider knowledge. Unknown/transport failures default to a retryable
 * server error (bounded by the policy's attempt cap).
 */
export function classifyLlmError(error: unknown): LlmError {
    if (error instanceof LlmError) return error;

    const e = error as { status?: number; code?: number | string; message?: string };
    const message = e?.message ?? String(error);
    const status = typeof e?.status === 'number' ? e.status : (typeof e?.code === 'number' ? e.code : undefined);
    const text = message.toUpperCase();

    if (status === 429 || text.includes('RESOURCE_EXHAUSTED') || text.includes('RATE LIMIT') || text.includes('429')) {
        return new LlmRateLimitError(message, error);
    }
    if (status === 401 || status === 403 || text.includes('PERMISSION_DENIED') || text.includes('UNAUTHENTICATED') || text.includes('API KEY')) {
        return new LlmAuthError(message, error);
    }
    if (status === 400 || text.includes('INVALID_ARGUMENT') || text.includes('FAILED_PRECONDITION')) {
        return new LlmBadRequestError(message, error);
    }
    if ((status !== undefined && status >= 500) || text.includes('UNAVAILABLE') || text.includes('INTERNAL')
        || text.includes('ECONNRESET') || text.includes('ETIMEDOUT') || text.includes('ENOTFOUND') || text.includes('FETCH FAILED')) {
        return new LlmServerError(message, error);
    }
    return new LlmServerError(message, error);
}
