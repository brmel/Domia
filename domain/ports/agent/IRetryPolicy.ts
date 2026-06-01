/**
 * Provider-neutral retry policy (W13). Wraps an async operation and retries it
 * while the thrown error is a retryable `LlmError` (or whatever `isRetryable`
 * decides), using bounded exponential backoff. Has zero provider knowledge — the
 * adapter classifies SDK errors into the domain taxonomy before they reach here.
 */
export interface IRetryPolicy {
    readonly maxAttempts: number;
    /** Backoff delay (ms) before the given 0-based retry attempt. */
    delayMs(attempt: number): number;
    /** Whether a thrown value should be retried. */
    isRetryable(error: unknown): boolean;
    /** Run `op`, retrying transient failures up to `maxAttempts`. */
    execute<T>(op: () => Promise<T>): Promise<T>;
}
