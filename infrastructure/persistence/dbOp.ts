import { ResultAsync } from 'neverthrow';
import { PersistenceError } from '@domain/errors';

export function dbOp<T>(promise: Promise<T>, label: string): ResultAsync<T, PersistenceError> {
    return ResultAsync.fromPromise(promise, (e) => new PersistenceError(`Failed to ${label}: ${e}`));
}

export function pickDefined<Row>(cols: ReadonlyArray<readonly [string, unknown]>): Partial<Row> {
    return Object.fromEntries(cols.filter(([, value]) => value !== undefined)) as Partial<Row>;
}
