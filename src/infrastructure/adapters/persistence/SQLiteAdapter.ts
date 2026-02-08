import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect, Generated } from 'kysely';
import fs from 'fs-extra';
import path from 'path';
import { IPersistenceAdapter, TestRun, TestStep, LogEntry } from '@domain/ports';
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
    created_at: string;
}

interface DatabaseSchema {
    test_runs: TestRunTable;
    test_steps: TestStepTable;
    logs: LogTable;
    workflow_checkpoints: WorkflowCheckpointTable;
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
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(run_id) REFERENCES test_runs(id)
            );
        `);
    }

    saveTestRun(run: TestRun): ResultAsync<void, PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.insertInto('test_runs')
                .values({
                    id: run.id,
                    url: run.url,
                    status: run.status,
                    started_at: run.startedAt,
                    completed_at: run.completedAt ?? null,
                    duration_ms: run.durationMs ?? null,
                    goal: run.goal ?? null,
                    summary: run.summary ?? null
                })
                .execute(),
            (e) => new PersistenceError(`Failed to save test run: ${e}`)
        ).map(() => undefined);
    }

    updateTestRun(id: string, updates: Partial<TestRun>): ResultAsync<void, PersistenceError> {
        // Map domain fields to DB fields
        const values: Partial<TestRunTable> = {};
        if (updates.status) values.status = updates.status;
        if (updates.completedAt) values.completed_at = updates.completedAt;
        if (updates.durationMs) values.duration_ms = updates.durationMs;
        if (updates.summary) values.summary = updates.summary;

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
        return {
            id: row.id,
            url: row.url,
            status: row.status as TestRun['status'],
            startedAt: row.started_at,
            ...(row.completed_at ? { completedAt: row.completed_at } : {}),
            ...(row.duration_ms ? { durationMs: row.duration_ms } : {}),
            ...(row.goal ? { goal: row.goal } : {}),
            ...(row.summary ? { summary: row.summary } : {})
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
            actionType: row.action_type,
            actionPayload: action,
            timestamp: row.timestamp
        };
    }

    clearHistory(): ResultAsync<void, PersistenceError> {
        return ResultAsync.fromPromise(
            (async () => {
                await this.db.deleteFrom('test_steps').execute();
                await this.db.deleteFrom('logs').execute();
                await this.db.deleteFrom('workflow_checkpoints').execute();
                await this.db.deleteFrom('test_runs').execute();
            })(),
            (e) => new PersistenceError(`Failed to clear history: ${e}`)
        ).map(() => undefined);
    }

    saveCheckpoint(runId: string, state: import('@domain/value-objects/WorkflowState').WorkflowState): ResultAsync<void, PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.insertInto('workflow_checkpoints')
                .values({
                    run_id: runId,
                    state_json: JSON.stringify(state),
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
}
