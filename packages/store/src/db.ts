import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SCHEMA } from './schema.js';

export type Row = Record<string, unknown>;

/**
 * Thin wrapper over node:sqlite (D24 — built-in, synchronous, no native build).
 * Repos expose an async facade over this so the engine stays swappable (S2).
 */
export class Db {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
  }

  migrate(): void {
    this.db.exec(SCHEMA);
  }

  run(sql: string, ...params: SqlParam[]): void {
    this.db.prepare(sql).run(...params);
  }
  get<T extends Row = Row>(sql: string, ...params: SqlParam[]): T | null {
    return (this.db.prepare(sql).get(...params) as T | undefined) ?? null;
  }
  all<T extends Row = Row>(sql: string, ...params: SqlParam[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  close(): void {
    this.db.close();
  }
}

export type SqlParam = string | number | bigint | null | Uint8Array;
export const j = (v: unknown): string => JSON.stringify(v ?? null);
export const p = <T>(s: unknown): T => JSON.parse(String(s)) as T;
export const bool = (b: boolean): number => (b ? 1 : 0);
