import { ResultAsync } from 'neverthrow';
import { PersistenceError } from '@domain/errors';

/**
 * Wrap a Kysely/SQLite promise as a ResultAsync<T, PersistenceError>.
 *
 * Eliminates the repeated `ResultAsync.fromPromise(query, e => new PersistenceError(...))` pattern
 * found across every repository method.
 */
export function dbOp<T>(promise: Promise<T>, label: string): ResultAsync<T, PersistenceError> {
    return ResultAsync.fromPromise(promise, (e) => new PersistenceError(`Failed to ${label}: ${e}`));
}
