import { ResultAsync } from 'neverthrow';
import { InteractionError } from '@domain/errors';

export function wrapInteraction<T>(promise: Promise<T>, label: string, ref?: string): ResultAsync<T, InteractionError> {
    return ResultAsync.fromPromise(promise, (e) => new InteractionError(`${label} failed: ${String(e)}`, ref));
}
