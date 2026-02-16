export type RetryInfo = {
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    error: unknown;
    label?: string;
};

export type RetryOptions = {
    attempts?: number;
    minDelayMs?: number;
    maxDelayMs?: number;
    jitter?: number;
    label?: string;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
    onRetry?: (info: RetryInfo) => void;
};

const DEFAULT_RETRY_OPTIONS: Required<Pick<RetryOptions, 'attempts' | 'minDelayMs' | 'maxDelayMs' | 'jitter'>> = {
    attempts: 3,
    minDelayMs: 300,
    maxDelayMs: 30_000,
    jitter: 0,
};

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function applyJitter(baseDelayMs: number, jitter: number): number {
    if (!Number.isFinite(jitter) || jitter <= 0) {
        return baseDelayMs;
    }

    const boundedJitter = clamp(jitter, 0, 1);
    const delta = (Math.random() * 2 - 1) * boundedJitter;
    return Math.max(0, Math.round(baseDelayMs * (1 + delta)));
}

export async function retryAsync<T>(
    operation: () => Promise<T>,
    options?: RetryOptions
): Promise<T> {
    const attempts = Math.max(1, Math.floor(options?.attempts ?? DEFAULT_RETRY_OPTIONS.attempts));
    const minDelayMs = Math.max(0, Math.floor(options?.minDelayMs ?? DEFAULT_RETRY_OPTIONS.minDelayMs));
    const maxDelayMs = Math.max(minDelayMs, Math.floor(options?.maxDelayMs ?? DEFAULT_RETRY_OPTIONS.maxDelayMs));
    const jitter = options?.jitter ?? DEFAULT_RETRY_OPTIONS.jitter;
    const shouldRetry = options?.shouldRetry ?? ((_: unknown, __: number): boolean => true);

    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            if (attempt >= attempts || !shouldRetry(error, attempt)) {
                break;
            }

            const exponentialDelay = Math.min(maxDelayMs, minDelayMs * (2 ** (attempt - 1)));
            const delayMs = applyJitter(exponentialDelay, jitter);

            options?.onRetry?.({
                attempt,
                maxAttempts: attempts,
                delayMs,
                error,
                ...(options?.label ? { label: options.label } : {})
            });

            await sleep(delayMs);
        }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
