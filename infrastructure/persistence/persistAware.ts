import { ResultAsync } from 'neverthrow';
import { PersistenceError } from '@domain/errors';
import type { SqlJsConnection } from './SqlJsConnection';

type RepoMethod = (...args: never[]) => ResultAsync<unknown, PersistenceError>;
type MethodKind = 'read' | 'write';

export function persistAware<T extends Record<keyof T, RepoMethod>>(
    conn: SqlJsConnection,
    repo: () => T,
    methods: { readonly [K in keyof T]: MethodKind },
): T {
    const adapter: Record<string, unknown> = {};
    for (const name of Object.keys(methods) as (keyof T & string)[]) {
        const wrap = methods[name] === 'write'
            ? conn.withPersist.bind(conn)
            : conn.withReady.bind(conn);
        adapter[name] = (...args: unknown[]) =>
            wrap(() => (repo()[name] as unknown as (...a: unknown[]) => ResultAsync<unknown, PersistenceError>)(...args));
    }
    return adapter as T;
}
