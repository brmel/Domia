import type { BaseLlm } from '@google/adk';
import type { IRetryPolicy } from '@domain/ports/agent/IRetryPolicy';
import { classifyLlmError } from '@infrastructure/llm/classifyLlmError';

type GenerateFn = (req: unknown, stream?: boolean) => AsyncGenerator<unknown>;

/**
 * Retries a transient failure obtaining the FIRST streamed chunk; once any chunk is
 * yielded the stream continues un-retried (never replays partial output). Errors are
 * classified into the domain taxonomy before the retry decision.
 */
export function withLlmRetry(llm: BaseLlm, policy: IRetryPolicy): BaseLlm {
    const original = (llm.generateContentAsync as GenerateFn).bind(llm);

    const wrapped: GenerateFn = async function* (req, stream) {
        let attempt = 0;
        for (;;) {
            const gen = original(req, stream);
            let first: IteratorResult<unknown>;
            try {
                first = await gen.next();
            } catch (error) {
                const classified = classifyLlmError(error);
                if (classified.retryable && attempt < policy.maxAttempts - 1) {
                    await new Promise((resolve) => setTimeout(resolve, policy.delayMs(attempt)));
                    attempt += 1;
                    continue;
                }
                throw classified;
            }
            if (!first.done) {
                yield first.value;
                yield* gen;
            }
            return;
        }
    };

    (llm as unknown as { generateContentAsync: GenerateFn }).generateContentAsync = wrapped;
    return llm;
}
