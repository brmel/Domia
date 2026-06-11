import type { Result } from 'neverthrow';

export function unwrap<T>(result: Result<T, Error>): T {
    if (result.isErr()) throw new Error(result.error.message);
    return result.value;
}
