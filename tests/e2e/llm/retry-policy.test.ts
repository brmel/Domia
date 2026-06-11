import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { ExponentialBackoffRetryPolicy } from '@infrastructure/llm/ExponentialBackoffRetryPolicy';
import { classifyLlmError } from '@infrastructure/llm/classifyLlmError';
import { LlmRateLimitError, LlmServerError, LlmAuthError, LlmBadRequestError } from '@domain/errors';
import { withLlmRetry } from '@infrastructure/agent-runtime/adk/withLlmRetry';
import type { BaseLlm } from '@google/adk';

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

describe('LLM retry via withLlmRetry (W13)', () => {
    const instantPolicy = { maxAttempts: 3, delayMs: () => 0 };

    function fakeLlm(generate: () => AsyncGenerator<unknown>): BaseLlm {
        return { generateContentAsync: generate } as unknown as BaseLlm;
    }

    it('retries a retryable first-chunk failure then streams', async () => {
        let calls = 0;
        const llm = withLlmRetry(fakeLlm(async function* () {
            calls += 1;
            if (calls < 2) throw { status: 429, message: 'Too Many Requests' };
            yield 'chunk';
        }), instantPolicy);

        const chunks: unknown[] = [];
        for await (const chunk of (llm.generateContentAsync as () => AsyncGenerator<unknown>)()) {
            chunks.push(chunk);
        }
        expect(chunks).toEqual(['chunk']);
        expect(calls).toBe(2);
    });

    it('surfaces a non-retryable failure immediately (no retry)', async () => {
        let calls = 0;
        const llm = withLlmRetry(fakeLlm(async function* () {
            calls += 1;
            throw { status: 401, message: 'Invalid API key' };
            yield 'unreachable';
        }), instantPolicy);

        const consume = async () => {
            for await (const chunk of (llm.generateContentAsync as () => AsyncGenerator<unknown>)()) {
                void chunk;
            }
        };
        await expect(consume()).rejects.toBeInstanceOf(LlmAuthError);
        expect(calls).toBe(1);
    });

    it('backoff is monotonic and capped', () => {
        const policy = new ExponentialBackoffRetryPolicy();
        expect(policy.delayMs(0)).toBeLessThanOrEqual(policy.delayMs(1));
        expect(policy.delayMs(50)).toBeLessThanOrEqual(policy.delayMs(50));
    });
});
