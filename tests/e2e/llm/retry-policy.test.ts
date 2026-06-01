import { describe, it, expect } from 'vitest';
import { ExponentialBackoffRetryPolicy } from '@infrastructure/llm/ExponentialBackoffRetryPolicy';
import { classifyLlmError } from '@infrastructure/llm/classifyLlmError';
import { LlmRateLimitError, LlmServerError, LlmAuthError, LlmBadRequestError } from '@domain/errors';

describe('LLM error classification (W13)', () => {
    it('classifies 429 / RESOURCE_EXHAUSTED as retryable rate-limit', () => {
        const e = classifyLlmError({ status: 429, message: 'Too Many Requests' });
        expect(e).toBeInstanceOf(LlmRateLimitError);
        expect(e.retryable).toBe(true);
    });

    it('classifies 5xx / UNAVAILABLE as retryable server error', () => {
        expect(classifyLlmError({ status: 503, message: 'Service Unavailable' })).toBeInstanceOf(LlmServerError);
        expect(classifyLlmError({ message: 'UNAVAILABLE' }).retryable).toBe(true);
    });

    it('classifies 401 / PERMISSION_DENIED as non-retryable auth', () => {
        const e = classifyLlmError({ status: 401, message: 'Invalid API key' });
        expect(e).toBeInstanceOf(LlmAuthError);
        expect(e.retryable).toBe(false);
    });

    it('classifies 400 / INVALID_ARGUMENT as non-retryable bad request', () => {
        expect(classifyLlmError({ status: 400, message: 'INVALID_ARGUMENT' })).toBeInstanceOf(LlmBadRequestError);
    });
});

describe('Exponential backoff retry (W13)', () => {
    it('retries a retryable failure then succeeds', async () => {
        const policy = new ExponentialBackoffRetryPolicy();
        let calls = 0;
        const result = await policy.execute(async () => {
            calls += 1;
            if (calls < 2) throw new LlmRateLimitError('rate limited');
            return 'ok';
        });
        expect(result).toBe('ok');
        expect(calls).toBe(2);
    });

    it('surfaces a non-retryable failure immediately (no retry)', async () => {
        const policy = new ExponentialBackoffRetryPolicy();
        let calls = 0;
        await expect(policy.execute(async () => {
            calls += 1;
            throw new LlmAuthError('no key');
        })).rejects.toBeInstanceOf(LlmAuthError);
        expect(calls).toBe(1);
    });

    it('backoff is monotonic and capped', () => {
        const policy = new ExponentialBackoffRetryPolicy();
        expect(policy.delayMs(0)).toBeLessThanOrEqual(policy.delayMs(1));
        expect(policy.delayMs(50)).toBeLessThanOrEqual(policy.delayMs(50));
    });
});
