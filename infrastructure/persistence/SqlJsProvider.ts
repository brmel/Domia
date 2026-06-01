import initSqlJs, { type SqlJsStatic, type Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs-extra';
import path from 'path';

let sqlModule: SqlJsStatic | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
    if (!sqlModule) {
        sqlModule = await initSqlJs();
    }
    return sqlModule;
}

export async function openDatabase(dbPath: string): Promise<SqlJsDatabase> {
    const SQL = await getSqlJs();
    fs.ensureDirSync(path.dirname(dbPath));

    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        return new SQL.Database(buffer);
    }
    return new SQL.Database();
}

export async function createInMemoryDatabase(): Promise<SqlJsDatabase> {
    const SQL = await getSqlJs();
    return new SQL.Database();
}

/**
 * Crash-safe flush: serialize the whole DB to a temp file, fsync-free copy the
 * prior good file to `.bak`, then atomically rename the temp over the real file.
 * A crash mid-write can only damage the temp file — the real `.db` is replaced in
 * a single rename, so it is never left truncated. (W4)
 */
export function saveDatabase(db: SqlJsDatabase, dbPath: string): void {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.ensureDirSync(path.dirname(dbPath));

    const tmpPath = `${dbPath}.tmp`;
    fs.writeFileSync(tmpPath, buffer);
    if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, `${dbPath}.bak`);
    }
    fs.renameSync(tmpPath, dbPath);
}
