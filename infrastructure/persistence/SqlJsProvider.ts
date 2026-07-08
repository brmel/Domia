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

    const tryLoad = (file: string): SqlJsDatabase | null => {
        if (!fs.existsSync(file)) return null;
        try {
            const db = new SQL.Database(fs.readFileSync(file));
            db.exec('PRAGMA schema_version');
            return db;
        } catch {
            return null;
        }
    };

    return tryLoad(dbPath) ?? tryLoad(`${dbPath}.bak`) ?? new SQL.Database();
}

export async function createInMemoryDatabase(): Promise<SqlJsDatabase> {
    const SQL = await getSqlJs();
    return new SQL.Database();
}

/**
 * Crash-safe flush: write the DB to a temp file, back up the prior file, then
 * atomically rename over the real `.db` — a crash mid-write can only damage the temp.
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
