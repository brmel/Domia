import { injectable } from 'tsyringe';
import type { IRetryPolicy } from '@domain/ports/agent/IRetryPolicy';
import { LlmError } from '@domain/errors';
import { DEFAULT_RETRY_ATTEMPTS, DEFAULT_RETRY_MIN_DELAY_MS, DEFAULT_RETRY_MAX_DELAY_MS } from '@shared/defaults';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Bounded exponential-backoff IRetryPolicy; retries only errors `isRetryable` accepts, surfaces the rest immediately. */
@injectable()
export class ExponentialBackoffRetryPolicy implements IRetryPolicy {
    readonly maxAttempts = DEFAULT_RETRY_ATTEMPTS;
    private readonly minDelay = DEFAULT_RETRY_MIN_DELAY_MS;
    private readonly maxDelay = DEFAULT_RETRY_MAX_DELAY_MS;

    delayMs(attempt: number): number {
        return Math.min(this.minDelay * 2 ** attempt, this.maxDelay);
    }

    isRetryable(error: unknown): boolean {
        return error instanceof LlmError && error.retryable;
    }

    async execute<T>(op: () => Promise<T>): Promise<T> {
        let attempt = 0;
        for (;;) {
            try {
                return await op();
            } catch (error) {
                if (this.isRetryable(error) && attempt < this.maxAttempts - 1) {
                    await sleep(this.delayMs(attempt));
                    attempt += 1;
                    continue;
                }
                throw error;
            }
        }
    }
}
