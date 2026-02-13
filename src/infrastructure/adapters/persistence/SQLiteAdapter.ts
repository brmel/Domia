import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect, Generated } from 'kysely';
import fs from 'fs-extra';
import path from 'path';
import { IPersistenceAdapter, TestStep, LogEntry } from '@domain/ports';
import { TestRun, TestRunStatus } from '@domain/entities/TestRun';
import { TestRunId, Url } from '@domain/value-objects';
import { PersistenceError } from '@domain/errors';
import { ConfigService } from '../../config/ConfigService';

interface TestRunTable {
    id: string;
    url: string;
    status: string;
    started_at: string;
    completed_at: string | null;
    duration_ms: number | null;
    goal: string | null;
    summary: string | null;
}

interface TestStepTable {
    id: string;
    test_run_id: string;
    step_number: number;
    action_type: string;
    action_payload: string; // JSON string
    assets_json: string | null; // JSON string
    timestamp: string;
}

interface LogTable {
    id: Generated<number>;
    test_run_id: string;
    level: string;
    message: string;
    metadata: string | null; // JSON string
    timestamp: string;
}

interface WorkflowCheckpointTable {
    id: Generated<number>;
    run_id: string;
    state_json: string;
    reason: string;
    created_at: string;
}

interface ReplayIdempotencyKeyTable {
    id: Generated<number>;
    run_id: string;
    idempotency_key: string;
    created_at: string;
}

interface DatabaseSchema {
    test_runs: TestRunTable;
    test_steps: TestStepTable;
    logs: LogTable;
    workflow_checkpoints: WorkflowCheckpointTable;
    replay_idempotency_keys: ReplayIdempotencyKeyTable;
}

@injectable()
export class SQLiteAdapter implements IPersistenceAdapter {
    private db: Kysely<DatabaseSchema>;

    constructor(@inject(ConfigService) configService: ConfigService) {
        const config = configService.get();
        const dbPath = config.paths.databasePath;

        fs.ensureDirSync(path.dirname(dbPath));

        const database = new Database(dbPath);
        this.db = new Kysely<DatabaseSchema>({
            dialect: new SqliteDialect({
                database,
            }),
        });

        this.initializeSchema(database);
    }

    private initializeSchema(database: Database.Database): void {
        database.exec(`
            CREATE TABLE IF NOT EXISTS test_runs (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                duration_ms INTEGER,
                goal TEXT,
                summary TEXT
            );

            CREATE TABLE IF NOT EXISTS test_steps (
                id TEXT PRIMARY KEY,
                test_run_id TEXT NOT NULL,
                step_number INTEGER NOT NULL,
                action_type TEXT NOT NULL,
                action_payload JSON,
                assets_json JSON,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(test_run_id) REFERENCES test_runs(id)
            );

            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                test_run_id TEXT NOT NULL,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                metadata JSON,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(test_run_id) REFERENCES test_runs(id)
            );

            CREATE TABLE IF NOT EXISTS workflow_checkpoints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                state_json JSON NOT NULL,
                reason TEXT NOT NULL DEFAULT 'action_applied',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(run_id) REFERENCES test_runs(id)
            );

            CREATE TABLE IF NOT EXISTS replay_idempotency_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                idempotency_key TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(run_id, idempotency_key),
                FOREIGN KEY(run_id) REFERENCES test_runs(id)
            );
        `);

        try {
            database.exec('ALTER TABLE test_steps ADD COLUMN assets_json JSON;');
        } catch (e) {
            // Column likely already exists, ignore
        }

        try {
            database.exec("ALTER TABLE workflow_checkpoints ADD COLUMN reason TEXT NOT NULL DEFAULT 'action_applied';");
        } catch (e) {
            // Column likely already exists, ignore
        }
    }

    saveTestRun(run: TestRun): ResultAsync<void, PersistenceError> {
        // Extract flattened fields from TestRunStatus
        let summary: string | null = null;
        let durationMs: number | null = null;

        if (run.status.type === 'passed') {
            summary = run.status.summary;
            durationMs = run.status.duration;
        } else if (run.status.type === 'failed') {
            summary = run.status.error;
            durationMs = run.status.duration;
        } else if (run.status.type === 'cancelled') {
            summary = run.status.reason;
        }

        // startedAt is optional in interface (due to my fix) but required in DB? 
        // We set default in DB, but better to use run.startedAt if present or run.createdAt as fallback
        const startedAt = run.startedAt ? run.startedAt.toISOString() : run.createdAt.toISOString();

        return ResultAsync.fromPromise(
            this.db.insertInto('test_runs')
                .values({
                    id: run.id,
                    url: run.url,
                    status: run.status.type,
                    started_at: startedAt,
                    completed_at: null, // Initial save typically not completed
                    duration_ms: durationMs,
                    goal: run.prompt,
                    summary: summary
                })
                .execute(),
            (e) => new PersistenceError(`Failed to save test run: ${e}`)
        ).map(() => undefined);
    }

    updateTestRun(id: string, updates: Partial<TestRun>): ResultAsync<void, PersistenceError> {
        // Map domain fields to DB fields
        const values: Partial<TestRunTable> = {};

        // Handle Status Update
        if (updates.status) {
            values.status = updates.status.type;
            if (updates.status.type === 'passed') {
                values.summary = updates.status.summary;
                values.duration_ms = updates.status.duration;
            } else if (updates.status.type === 'failed') {
                values.summary = updates.status.error;
                values.duration_ms = updates.status.duration;
            } else if (updates.status.type === 'cancelled') {
                values.summary = updates.status.reason;
            }
        }

        if (updates.startedAt) values.started_at = updates.startedAt.toISOString();

        // We generally infer completed_at from status change to terminal state, 
        // but explicit update is respected.
        // TestRun entity doesn't have explicit completedAt, it's inside status for duration/summary? 
        // Actually TestRun Entity has updatedAt. 
        // The DB has completed_at. We can set completed_at = now if status is terminal.
        if (updates.status && ['passed', 'failed', 'cancelled'].includes(updates.status.type)) {
            values.completed_at = new Date().toISOString();
        }

        return ResultAsync.fromPromise(
            this.db.updateTable('test_runs')
                .set(values)
                .where('id', '=', id)
                .execute(),
            (e) => new PersistenceError(`Failed to update test run: ${e}`)
        ).map(() => undefined);
    }

    saveTestStep(step: TestStep): ResultAsync<void, PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.insertInto('test_steps')
                .values({
                    id: step.id,
                    test_run_id: step.testRunId,
                    step_number: step.stepNumber,
                    action_type: step.actionType,
                    action_payload: JSON.stringify(step.actionPayload),
                    assets_json: step.assets ? JSON.stringify(step.assets) : null,
                    timestamp: step.timestamp
                })
                .execute(),
            (e) => new PersistenceError(`Failed to save test step: ${e}`)
        ).map(() => undefined);
    }

    saveLog(log: LogEntry): ResultAsync<void, PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.insertInto('logs')
                .values({
                    test_run_id: log.testRunId,
                    level: log.level,
                    message: log.message,
                    metadata: log.metadata ? JSON.stringify(log.metadata) : null,
                    timestamp: log.timestamp
                })
                .execute(),
            (e) => new PersistenceError(`Failed to save log: ${e}`)
        ).map(() => undefined);
    }

    getTestRuns(limit: number = 50): ResultAsync<TestRun[], PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.selectFrom('test_runs')
                .selectAll()
                .orderBy('started_at', 'desc')
                .limit(limit)
                .execute(),
            (e) => new PersistenceError(`Failed to get test runs: ${e}`)
        ).map(rows => rows.map(row => this.mapToTestRun(row)));
    }

    getTestRun(id: string): ResultAsync<TestRun | null, PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.selectFrom('test_runs')
                .selectAll()
                .where('id', '=', id)
                .executeTakeFirst(),
            (e) => new PersistenceError(`Failed to get test run: ${e}`)
        ).map(row => row ? this.mapToTestRun(row) : null);
    }

    private mapToTestRun(row: TestRunTable): TestRun {
        let status: TestRunStatus;

        if (row.status === 'passed') {
            status = { type: 'passed', summary: row.summary || '', duration: row.duration_ms || 0 };
        } else if (row.status === 'failed') {
            status = { type: 'failed', error: row.summary || 'Unknown error', duration: row.duration_ms || 0 };
        } else if (row.status === 'cancelled') {
            status = { type: 'cancelled', reason: row.summary || '' };
        } else if (row.status === 'running') {
            status = { type: 'running' };
        } else {
            status = { type: 'pending' };
        }

        return {
            id: row.id as TestRunId,
            url: row.url as Url,
            prompt: row.goal || '',
            status: status,
            createdAt: new Date(row.started_at),
            startedAt: new Date(row.started_at),
            updatedAt: row.completed_at ? new Date(row.completed_at) : new Date(row.started_at)
        };
    }

    getTestSteps(runId: string): ResultAsync<TestStep[], PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.selectFrom('test_steps')
                .selectAll()
                .where('test_run_id', '=', runId)
                .orderBy('step_number', 'asc')
                .execute(),
            (e) => new PersistenceError(`Failed to get test steps: ${e}`)
        ).map(rows => rows.map(row => this.mapToTestStep(row)));
    }

    private mapToTestStep(row: TestStepTable): TestStep {
        const action = JSON.parse(row.action_payload);
        return {
            id: row.id,
            testRunId: row.test_run_id,
            stepNumber: row.step_number,
            actionType: row.action_type as import('@domain/enums/ActionType').ActionType,
            actionPayload: action,
            assets: row.assets_json ? JSON.parse(row.assets_json) : undefined,
            timestamp: row.timestamp
        };
    }

    clearHistory(): ResultAsync<void, PersistenceError> {
        return ResultAsync.fromPromise(
            (async (): Promise<void> => {
                await this.db.deleteFrom('test_steps').execute();
                await this.db.deleteFrom('logs').execute();
                await this.db.deleteFrom('workflow_checkpoints').execute();
                await this.db.deleteFrom('replay_idempotency_keys').execute();
                await this.db.deleteFrom('test_runs').execute();
            })(),
            (e) => new PersistenceError(`Failed to clear history: ${e}`)
        ).map(() => undefined);
    }

    saveCheckpoint(
        runId: string,
        state: import('@domain/value-objects/WorkflowState').WorkflowState,
        reason: import('@domain/value-objects/RunLifecycle').RunCheckpointReason
    ): ResultAsync<void, PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.insertInto('workflow_checkpoints')
                .values({
                    run_id: runId,
                    state_json: JSON.stringify(state),
                    reason,
                    created_at: new Date().toISOString()
                })
                .execute(),
            (e) => new PersistenceError(`Failed to save checkpoint: ${e}`)
        ).map(() => undefined);
    }

    getCheckpoint(runId: string): ResultAsync<import('@domain/value-objects/WorkflowState').WorkflowState | null, PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.selectFrom('workflow_checkpoints')
                .select('state_json')
                .where('run_id', '=', runId)
                .orderBy('created_at', 'desc')
                .limit(1)
                .executeTakeFirst(),
            (e) => new PersistenceError(`Failed to get checkpoint: ${e}`)
        ).map(row => row ? JSON.parse(row.state_json) : null);
    }

    getCheckpointRecords(runId: string): ResultAsync<import('@domain/value-objects/CheckpointReadModel').CheckpointRecord[], PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.selectFrom('workflow_checkpoints')
                .select(['run_id', 'state_json', 'reason', 'created_at'])
                .where('run_id', '=', runId)
                .orderBy('created_at', 'asc')
                .execute(),
            (e) => new PersistenceError(`Failed to get checkpoint records: ${e}`)
        ).map(rows => rows.map(row => ({
            runId: row.run_id,
            createdAt: row.created_at,
            reason: row.reason as import('@domain/value-objects/RunLifecycle').RunCheckpointReason,
            state: JSON.parse(row.state_json)
        })));
    }

    saveReplayIdempotencyKey(runId: string, idempotencyKey: string): ResultAsync<void, PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.insertInto('replay_idempotency_keys')
                .values({
                    run_id: runId,
                    idempotency_key: idempotencyKey,
                    created_at: new Date().toISOString()
                })
                .onConflict(oc => oc.columns(['run_id', 'idempotency_key']).doNothing())
                .execute(),
            (e) => new PersistenceError(`Failed to save replay idempotency key: ${e}`)
        ).map(() => undefined);
    }

    hasReplayIdempotencyKey(runId: string, idempotencyKey: string): ResultAsync<boolean, PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.selectFrom('replay_idempotency_keys')
                .select(['id'])
                .where('run_id', '=', runId)
                .where('idempotency_key', '=', idempotencyKey)
                .limit(1)
                .executeTakeFirst(),
            (e) => new PersistenceError(`Failed to query replay idempotency key: ${e}`)
        ).map(row => Boolean(row));
    }
}
