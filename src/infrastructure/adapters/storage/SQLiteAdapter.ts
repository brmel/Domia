import { injectable } from 'tsyringe';
import { ResultAsync, errAsync } from 'neverthrow';
import Database from 'better-sqlite3';
import type { ITestRunStorage } from '@domain/ports';
import type { TestRun, TestRunStatus } from '@domain/entities';
import type { TestRunId, ArtifactPath } from '@domain/value-objects';
import { StorageError, NotFoundError } from '@domain/errors';

interface TestRunRow {
    id: string;
    url: string;
    prompt: string;
    status_type: string;
    status_data: string | null;
    artifacts_video: string | null;
    artifacts_trace: string | null;
    steps_json: string;
    created_at: string;
    updated_at: string;
}

/**
 * SQLiteAdapter
 * Implements ITestRunStorage port using better-sqlite3
 */
@injectable()
export class SQLiteAdapter implements ITestRunStorage {
    private db: Database.Database;

    constructor() {
        this.db = new Database(':memory:'); // In-memory for now, configure path later
        this.initSchema();
    }

    private initSchema(): void {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS test_runs (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status_type TEXT NOT NULL,
        status_data TEXT,
        artifacts_video TEXT,
        artifacts_trace TEXT,
        steps_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    }

    save(run: TestRun): ResultAsync<void, StorageError> {
        return ResultAsync.fromPromise(
            Promise.resolve(this.doSave(run)),
            (e) => new StorageError(`Failed to save test run: ${String(e)}`)
        );
    }

    private doSave(run: TestRun): void {
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO test_runs 
      (id, url, prompt, status_type, status_data, artifacts_video, artifacts_trace, steps_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        stmt.run(
            run.id,
            run.url,
            run.prompt,
            run.status.type,
            this.serializeStatusData(run.status),
            run.artifacts.video,
            run.artifacts.trace,
            JSON.stringify(run.steps),
            run.createdAt.toISOString(),
            run.updatedAt.toISOString()
        );
    }

    findById(id: TestRunId): ResultAsync<TestRun | null, StorageError> {
        return ResultAsync.fromPromise(
            Promise.resolve(this.doFindById(id)),
            (e) => new StorageError(`Failed to find test run: ${String(e)}`)
        );
    }

    private doFindById(id: TestRunId): TestRun | null {
        const stmt = this.db.prepare('SELECT * FROM test_runs WHERE id = ?');
        const row = stmt.get(id) as TestRunRow | undefined;
        return row ? this.rowToTestRun(row) : null;
    }

    findAll(): ResultAsync<readonly TestRun[], StorageError> {
        return ResultAsync.fromPromise(
            Promise.resolve(this.doFindAll()),
            (e) => new StorageError(`Failed to list test runs: ${String(e)}`)
        );
    }

    private doFindAll(): readonly TestRun[] {
        const stmt = this.db.prepare('SELECT * FROM test_runs ORDER BY created_at DESC');
        const rows = stmt.all() as TestRunRow[];
        return Object.freeze(rows.map((row) => this.rowToTestRun(row)));
    }

    delete(id: TestRunId): ResultAsync<void, StorageError | NotFoundError> {
        const existing = this.doFindById(id);
        if (!existing) {
            return errAsync(new NotFoundError('TestRun', id));
        }
        return ResultAsync.fromPromise(
            Promise.resolve(this.doDelete(id)),
            (e) => new StorageError(`Failed to delete test run: ${String(e)}`)
        );
    }

    private doDelete(id: TestRunId): void {
        const stmt = this.db.prepare('DELETE FROM test_runs WHERE id = ?');
        stmt.run(id);
    }

    private rowToTestRun(row: TestRunRow): TestRun {
        return {
            id: row.id as TestRunId,
            url: row.url as never, // Url branded type
            prompt: row.prompt,
            status: this.deserializeStatus(row.status_type, row.status_data),
            steps: JSON.parse(row.steps_json),
            artifacts: {
                video: row.artifacts_video as ArtifactPath | null,
                trace: row.artifacts_trace as ArtifactPath | null,
            },
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
        };
    }

    private serializeStatusData(status: TestRunStatus): string | null {
        switch (status.type) {
            case 'running':
                return JSON.stringify({ currentStep: status.currentStep });
            case 'passed':
                return JSON.stringify({ summary: status.summary, duration: status.duration });
            case 'failed':
                return JSON.stringify({ error: status.error, failedAtStep: status.failedAtStep, duration: status.duration });
            case 'cancelled':
                return JSON.stringify({ reason: status.reason });
            default:
                return null;
        }
    }

    private deserializeStatus(type: string, data: string | null): TestRunStatus {
        const parsed = data ? JSON.parse(data) : {};
        switch (type) {
            case 'pending':
                return { type: 'pending' };
            case 'running':
                return { type: 'running', currentStep: parsed.currentStep ?? 0 };
            case 'passed':
                return { type: 'passed', summary: parsed.summary ?? '', duration: parsed.duration ?? 0 };
            case 'failed':
                return { type: 'failed', error: parsed.error ?? '', failedAtStep: parsed.failedAtStep ?? 0, duration: parsed.duration ?? 0 };
            case 'cancelled':
                return { type: 'cancelled', reason: parsed.reason ?? '' };
            default:
                return { type: 'pending' };
        }
    }

    close(): void {
        this.db.close();
    }
}
