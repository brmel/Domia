import { injectable } from 'tsyringe';
import type { IRetryPolicy } from '@domain/ports/agent/IRetryPolicy';
import { DEFAULT_RETRY_ATTEMPTS, DEFAULT_RETRY_MIN_DELAY_MS, DEFAULT_RETRY_MAX_DELAY_MS } from '@shared/defaults';

@injectable()
export class ExponentialBackoffRetryPolicy implements IRetryPolicy {
    readonly maxAttempts = DEFAULT_RETRY_ATTEMPTS;
    private readonly minDelay = DEFAULT_RETRY_MIN_DELAY_MS;
    private readonly maxDelay = DEFAULT_RETRY_MAX_DELAY_MS;

    delayMs(attempt: number): number {
        return Math.min(this.minDelay * 2 ** attempt, this.maxDelay);
    }
}
