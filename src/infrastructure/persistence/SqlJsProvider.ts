import initSqlJs, { type SqlJsStatic, type Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs-extra';
import path from 'path';

let sqlModule: SqlJsStatic | null = null;

/**
 * Returns the sql.js WASM module, initializing it on first call.
 * Subsequent calls return the cached instance.
 */
export async function getSqlJs(): Promise<SqlJsStatic> {
    if (!sqlModule) {
        sqlModule = await initSqlJs();
    }
    return sqlModule;
}

/**
 * Opens (or creates) a persistent SQLite database at `dbPath`.
 * Loads existing data from disk if the file exists.
 */
export async function openDatabase(dbPath: string): Promise<SqlJsDatabase> {
    const SQL = await getSqlJs();
    fs.ensureDirSync(path.dirname(dbPath));

    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        return new SQL.Database(buffer);
    }
    return new SQL.Database();
}

/**
 * Creates an in-memory database (for tests).
 */
export async function createInMemoryDatabase(): Promise<SqlJsDatabase> {
    const SQL = await getSqlJs();
    return new SQL.Database();
}

/**
 * Persists the current database state to disk.
 */
export function saveDatabase(db: SqlJsDatabase, dbPath: string): void {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.ensureDirSync(path.dirname(dbPath));
    fs.writeFileSync(dbPath, buffer);
}
