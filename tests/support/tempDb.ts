import { Kysely } from 'kysely';
import { SqlJsDialect } from 'kysely-wasm';
import type { Database as SqlJsDatabase } from 'sql.js';
import { createInMemoryDatabase } from '@infrastructure/persistence/SqlJsProvider';
import { initializeSchema } from '@infrastructure/persistence/SQLiteSchema';
import type { DatabaseSchema } from '@infrastructure/persistence/DatabaseSchema';

export async function createInMemoryDb(): Promise<{ db: Kysely<DatabaseSchema>; raw: SqlJsDatabase }> {
    const raw = await createInMemoryDatabase();
    raw.run('PRAGMA foreign_keys = ON;');
    const db = new Kysely<DatabaseSchema>({ dialect: new SqlJsDialect({ database: raw }) });
    initializeSchema(raw);
    return { db, raw };
}
