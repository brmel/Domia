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

export function saveDatabase(db: SqlJsDatabase, dbPath: string): void {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.ensureDirSync(path.dirname(dbPath));
    fs.writeFileSync(dbPath, buffer);
}
