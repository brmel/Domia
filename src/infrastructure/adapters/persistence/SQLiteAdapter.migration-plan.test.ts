import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { SQLITE_MIGRATION_IDS } from './SQLiteAdapter';

describe('SQLiteAdapter migration plan', () => {
    it('keeps deterministic migration ordering', () => {
        expect(SQLITE_MIGRATION_IDS).toEqual([
            '20260213_baseline_v1',
            '20260213_workflow_indexes_v1'
        ]);
    });
});
