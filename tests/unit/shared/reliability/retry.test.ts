import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { retryAsync } from '@shared/reliability/retry';

describe('retryAsync', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(async () => {
        await vi.runOnlyPendingTimersAsync();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('returns on first success', async () => {
        const operation = vi.fn().mockResolvedValue('ok');

        const promise = retryAsync(operation, { attempts: 3, minDelayMs: 10, maxDelayMs: 10 });
        await vi.runAllTimersAsync();

        await expect(promise).resolves.toBe('ok');
        expect(operation).toHaveBeenCalledTimes(1);
    });

    it('retries and then succeeds', async () => {
        const operation = vi
            .fn()
            .mockRejectedValueOnce(new Error('transient'))
            .mockResolvedValueOnce('ok');

        const onRetry = vi.fn();
        const promise = retryAsync(operation, {
            attempts: 3,
            minDelayMs: 10,
            maxDelayMs: 10,
            onRetry
        });

        await vi.runAllTimersAsync();

        await expect(promise).resolves.toBe('ok');
        expect(operation).toHaveBeenCalledTimes(2);
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('stops when shouldRetry returns false', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('fatal'));

        await expect(retryAsync(operation, {
            attempts: 5,
            minDelayMs: 10,
            maxDelayMs: 10,
            shouldRetry: () => false
        })).rejects.toThrow('fatal');
        expect(operation).toHaveBeenCalledTimes(1);
    });
});
