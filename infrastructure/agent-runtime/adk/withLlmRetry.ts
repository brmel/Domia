import type { BaseLlm } from '@google/adk';
import type { IRetryPolicy } from '@domain/ports/agent/IRetryPolicy';
import { classifyLlmError } from '@infrastructure/llm/classifyLlmError';

type GenerateFn = (req: unknown, stream?: boolean) => AsyncGenerator<unknown>;

/**
 * Wrap an ADK `BaseLlm` so transient failures at call-start are retried (W13).
 * Retry is applied only to obtaining the first streamed chunk — once any content
 * has been yielded the stream continues un-retried, so no partial output is ever
 * replayed. Errors are classified into the domain taxonomy before the retry
 * decision, and the (classified) error is what surfaces if retries are exhausted.
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
