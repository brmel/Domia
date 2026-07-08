import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { openDatabase, saveDatabase } from '@infrastructure/persistence/SqlJsProvider';

describe('db backup restore', () => {
    it('falls back to .bak when the primary file is corrupt', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'domia-bak-'));
        const dbPath = path.join(dir, 'domia.db');

        const db = await openDatabase(dbPath);
        db.exec("CREATE TABLE probe (id TEXT); INSERT INTO probe VALUES ('alive');");
        saveDatabase(db, dbPath);
        db.exec("INSERT INTO probe VALUES ('second');");
        saveDatabase(db, dbPath);
        db.close();

        await fs.writeFile(dbPath, 'garbage-not-a-sqlite-file');

        const restored = await openDatabase(dbPath);
        const rows = restored.exec('SELECT COUNT(*) FROM probe');
        expect(rows[0]!.values[0]![0]).toBe(1);
        restored.close();

        await fs.remove(dir);
    });

    it('starts fresh when both primary and backup are unreadable', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'domia-bak-'));
        const dbPath = path.join(dir, 'domia.db');
        await fs.writeFile(dbPath, 'garbage');
        await fs.writeFile(`${dbPath}.bak`, 'also-garbage');

        const db = await openDatabase(dbPath);
        expect(() => db.exec('PRAGMA schema_version')).not.toThrow();
        db.close();

        await fs.remove(dir);
    });
});
