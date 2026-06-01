/** Bounded-backoff retry over an async op; retries only errors `isRetryable` accepts (the LlmError taxonomy). */
export interface IRetryPolicy {
    readonly maxAttempts: number;
    delayMs(attempt: number): number;
    isRetryable(error: unknown): boolean;
    execute<T>(op: () => Promise<T>): Promise<T>;
}
