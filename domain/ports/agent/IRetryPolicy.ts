export interface IRetryPolicy {
    readonly maxAttempts: number;
    delayMs(attempt: number): number;
}
