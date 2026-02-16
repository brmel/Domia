import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect, Generated } from 'kysely';
import fs from 'fs-extra';
import path from 'path';
import { IPersistenceAdapter, TestStep, LogEntry } from '@domain/ports';
import { TestRun, TestRunStatus } from '@domain/entities/TestRun';
import type { WorkflowDefinition, WorkflowRunRecord, WorkflowStepRunRecord } from '@domain/entities/Workflow';
import type { AtomicWorkflowTransitionInput } from '@domain/ports/IPersistenceAdapter';
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
    checkpoint_id: string;
    parent_checkpoint_id: string | null;
    branch_id: string;
    sequence_number: number;
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

interface SchemaMigrationTable {
    id: string;
    applied_at: string;
}

interface WorkflowDefinitionTable {
    id: string;
    name: string;
    description: string | null;
    status: string;
    version: number;
    platform_config_json: string;
    steps_json: string;
    created_at: string;
    updated_at: string;
}

interface WorkflowRunTable {
    id: string;
    workflow_definition_id: string;
    workflow_version: number;
    status: string;
    summary: string | null;
    started_at: string;
    completed_at: string | null;
}

interface WorkflowStepRunTable {
    id: string;
    workflow_run_id: string;
    step_id: string;
    step_index: number;
    test_run_id: string | null;
    status: string;
    summary: string | null;
    started_at: string;
    completed_at: string | null;
}

interface DatabaseSchema {
    test_runs: TestRunTable;
    test_steps: TestStepTable;
    logs: LogTable;
    workflow_checkpoints: WorkflowCheckpointTable;
    replay_idempotency_keys: ReplayIdempotencyKeyTable;
    schema_migrations: SchemaMigrationTable;
    workflow_definitions: WorkflowDefinitionTable;
    workflow_runs: WorkflowRunTable;
    workflow_step_runs: WorkflowStepRunTable;
}

export const SQLITE_MIGRATION_IDS = ['20260213_baseline_v1', '20260213_workflow_indexes_v1'] as const;

@injectable()
export class SQLiteAdapter implements IPersistenceAdapter {
    private db: Kysely<DatabaseSchema>;
    private database: Database.Database;

    constructor(@inject(ConfigService) configService: ConfigService) {
        const config = configService.get();
        const dbPath = config.paths.databasePath;

        fs.ensureDirSync(path.dirname(dbPath));

        const database = new Database(dbPath);
        this.database = database;
        this.db = new Kysely<DatabaseSchema>({
            dialect: new SqliteDialect({
                database,
            }),
        });

        this.initializeSchema(database);
    }

    private initializeSchema(database: Database.Database): void {
        database.exec(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id TEXT PRIMARY KEY,
                applied_at DATETIME NOT NULL
            );
        `);

        this.applyMigrations(database);

        try {
            database.exec('ALTER TABLE test_steps ADD COLUMN assets_json JSON;');
        } catch {
            // Column already exists in upgraded databases.
        }

        try {
            database.exec("ALTER TABLE workflow_checkpoints ADD COLUMN reason TEXT NOT NULL DEFAULT 'action_applied';");
        } catch {
            // Column already exists in upgraded databases.
        }

        try {
            database.exec('ALTER TABLE workflow_checkpoints ADD COLUMN checkpoint_id TEXT;');
        } catch {
            // Column already exists in upgraded databases.
        }

        try {
            database.exec('ALTER TABLE workflow_checkpoints ADD COLUMN parent_checkpoint_id TEXT;');
        } catch {
            // Column already exists in upgraded databases.
        }

        try {
            database.exec("ALTER TABLE workflow_checkpoints ADD COLUMN branch_id TEXT NOT NULL DEFAULT 'main';");
        } catch {
            // Column already exists in upgraded databases.
        }

        try {
            database.exec('ALTER TABLE workflow_checkpoints ADD COLUMN sequence_number INTEGER NOT NULL DEFAULT 0;');
        } catch {
            // Column already exists in upgraded databases.
        }

        database.exec(`
            UPDATE workflow_checkpoints
            SET checkpoint_id = COALESCE(checkpoint_id, run_id || ':' || id)
            WHERE checkpoint_id IS NULL;
        `);

        database.exec('CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_run_created ON workflow_checkpoints(run_id, created_at);');
        database.exec('CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_run_branch_seq ON workflow_checkpoints(run_id, branch_id, sequence_number);');
    }

    private applyMigrations(database: Database.Database): void {
        const appliedRows = database.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: string }>;
        const applied = new Set(appliedRows.map((row) => row.id));

        const migrations: Array<{ id: string; apply: () => void }> = [
            {
                id: SQLITE_MIGRATION_IDS[0],
                apply: (): void => {
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
                            checkpoint_id TEXT NOT NULL,
                            parent_checkpoint_id TEXT,
                            branch_id TEXT NOT NULL,
                            sequence_number INTEGER NOT NULL,
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

                        CREATE TABLE IF NOT EXISTS workflow_definitions (
                            id TEXT PRIMARY KEY,
                            name TEXT NOT NULL,
                            description TEXT,
                            status TEXT NOT NULL,
                            version INTEGER NOT NULL,
                            platform_config_json JSON NOT NULL,
                            steps_json JSON NOT NULL,
                            created_at DATETIME NOT NULL,
                            updated_at DATETIME NOT NULL
                        );

                        CREATE TABLE IF NOT EXISTS workflow_runs (
                            id TEXT PRIMARY KEY,
                            workflow_definition_id TEXT NOT NULL,
                            workflow_version INTEGER NOT NULL,
                            status TEXT NOT NULL,
                            summary TEXT,
                            started_at DATETIME NOT NULL,
                            completed_at DATETIME,
                            FOREIGN KEY(workflow_definition_id) REFERENCES workflow_definitions(id)
                        );

                        CREATE TABLE IF NOT EXISTS workflow_step_runs (
                            id TEXT PRIMARY KEY,
                            workflow_run_id TEXT NOT NULL,
                            step_id TEXT NOT NULL,
                            step_index INTEGER NOT NULL,
                            test_run_id TEXT,
                            status TEXT NOT NULL,
                            summary TEXT,
                            started_at DATETIME NOT NULL,
                            completed_at DATETIME,
                            FOREIGN KEY(workflow_run_id) REFERENCES workflow_runs(id),
                            FOREIGN KEY(test_run_id) REFERENCES test_runs(id)
                        );

                        CREATE INDEX IF NOT EXISTS idx_test_runs_started_at ON test_runs(started_at);
                        CREATE INDEX IF NOT EXISTS idx_test_steps_run_step ON test_steps(test_run_id, step_number);
                        CREATE INDEX IF NOT EXISTS idx_workflow_definitions_updated_at ON workflow_definitions(updated_at);
                        CREATE INDEX IF NOT EXISTS idx_workflow_runs_started_at ON workflow_runs(started_at);
                        CREATE INDEX IF NOT EXISTS idx_workflow_step_runs_run_idx ON workflow_step_runs(workflow_run_id, step_index);
                        CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_run_created ON workflow_checkpoints(run_id, created_at);
                        CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_run_branch_seq ON workflow_checkpoints(run_id, branch_id, sequence_number);
                    `);
                }
            },
            {
                id: SQLITE_MIGRATION_IDS[1],
                apply: (): void => {
                    database.exec(`
                        CREATE INDEX IF NOT EXISTS idx_workflow_definitions_status ON workflow_definitions(status);
                        CREATE INDEX IF NOT EXISTS idx_workflow_runs_definition ON workflow_runs(workflow_definition_id, started_at);
                        CREATE INDEX IF NOT EXISTS idx_workflow_step_runs_test_run ON workflow_step_runs(test_run_id);
                    `);
                }
            }
        ];

        const insertMigration = database.prepare(
            'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)'
        );

        const tx = database.transaction(() => {
            for (const migration of migrations) {
                if (applied.has(migration.id)) {
                    continue;
                }

                migration.apply();
                insertMigration.run(migration.id, new Date().toISOString());
            }
        });

        tx();
    }

    saveTestRun(run: TestRun): ResultAsync<void, PersistenceError> {
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

        const startedAt = run.startedAt ? run.startedAt.toISOString() : run.createdAt.toISOString();

        return ResultAsync.fromPromise(
            this.db.insertInto('test_runs')
                .values({
                    id: run.id,
                    url: run.url,
                    status: run.status.type,
                    started_at: startedAt,
                    completed_at: null,
                    duration_ms: durationMs,
                    goal: run.prompt,
                    summary: summary
                })
                .execute(),
            (e) => new PersistenceError(`Failed to save test run: ${e}`)
        ).map(() => undefined);
    }

    updateTestRun(id: string, updates: Partial<TestRun>): ResultAsync<void, PersistenceError> {
        const values: Partial<TestRunTable> = {};

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
                await this.db.deleteFrom('workflow_step_runs').execute();
                await this.db.deleteFrom('workflow_runs').execute();
                await this.db.deleteFrom('workflow_definitions').execute();
                await this.db.deleteFrom('test_runs').execute();
            })(),
            (e) => new PersistenceError(`Failed to clear history: ${e}`)
        ).map(() => undefined);
    }

    saveCheckpoint(
        runId: string,
        state: import('@domain/value-objects/WorkflowState').WorkflowState,
        reason: import('@domain/value-objects/RunLifecycle').RunCheckpointReason,
        lineage: import('@domain/ports/IPersistenceAdapter').CheckpointLineageInput
    ): ResultAsync<void, PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.insertInto('workflow_checkpoints')
                .values({
                    run_id: runId,
                    checkpoint_id: lineage.checkpointId,
                    parent_checkpoint_id: lineage.parentCheckpointId,
                    branch_id: lineage.branchId,
                    sequence_number: lineage.sequenceNumber,
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
                .select([
                    'run_id',
                    'checkpoint_id',
                    'parent_checkpoint_id',
                    'branch_id',
                    'sequence_number',
                    'state_json',
                    'reason',
                    'created_at'
                ])
                .where('run_id', '=', runId)
                .orderBy('sequence_number', 'asc')
                .orderBy('created_at', 'asc')
                .execute(),
            (e) => new PersistenceError(`Failed to get checkpoint records: ${e}`)
        ).map(rows => rows.map(row => ({
            runId: row.run_id,
            checkpointId: row.checkpoint_id,
            parentCheckpointId: row.parent_checkpoint_id,
            branchId: row.branch_id,
            sequenceNumber: row.sequence_number,
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

    saveWorkflowDefinition(definition: WorkflowDefinition): ResultAsync<void, PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.insertInto('workflow_definitions')
                .values({
                    id: definition.id,
                    name: definition.name,
                    description: definition.description ?? null,
                    status: definition.status,
                    version: definition.version,
                    platform_config_json: JSON.stringify(definition.platformConfig),
                    steps_json: JSON.stringify(definition.steps),
                    created_at: definition.createdAt,
                    updated_at: definition.updatedAt
                })
                .onConflict(oc => oc.column('id').doUpdateSet({
                    name: definition.name,
                    description: definition.description ?? null,
                    status: definition.status,
                    version: definition.version,
                    platform_config_json: JSON.stringify(definition.platformConfig),
                    steps_json: JSON.stringify(definition.steps),
                    updated_at: definition.updatedAt
                }))
                .execute(),
            (e) => new PersistenceError(`Failed to save workflow definition: ${e}`)
        ).map(() => undefined);
    }

    getWorkflowDefinition(id: string): ResultAsync<WorkflowDefinition | null, PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.selectFrom('workflow_definitions')
                .selectAll()
                .where('id', '=', id)
                .executeTakeFirst(),
            (e) => new PersistenceError(`Failed to get workflow definition: ${e}`)
        ).map(row => row ? this.mapToWorkflowDefinition(row) : null);
    }

    getWorkflowDefinitions(limit: number = 100): ResultAsync<WorkflowDefinition[], PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.selectFrom('workflow_definitions')
                .selectAll()
                .orderBy('updated_at', 'desc')
                .limit(limit)
                .execute(),
            (e) => new PersistenceError(`Failed to get workflow definitions: ${e}`)
        ).map(rows => rows.map(row => this.mapToWorkflowDefinition(row)));
    }

    saveWorkflowRun(run: WorkflowRunRecord): ResultAsync<void, PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.insertInto('workflow_runs')
                .values({
                    id: run.id,
                    workflow_definition_id: run.workflowDefinitionId,
                    workflow_version: run.workflowVersion,
                    status: run.status,
                    summary: run.summary ?? null,
                    started_at: run.startedAt,
                    completed_at: run.completedAt ?? null
                })
                .execute(),
            (e) => new PersistenceError(`Failed to save workflow run: ${e}`)
        ).map(() => undefined);
    }

    updateWorkflowRun(id: string, updates: Partial<WorkflowRunRecord>): ResultAsync<void, PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.updateTable('workflow_runs')
                .set({
                    ...(updates.workflowDefinitionId !== undefined ? { workflow_definition_id: updates.workflowDefinitionId } : {}),
                    ...(updates.workflowVersion !== undefined ? { workflow_version: updates.workflowVersion } : {}),
                    ...(updates.status !== undefined ? { status: updates.status } : {}),
                    ...(updates.summary !== undefined ? { summary: updates.summary } : {}),
                    ...(updates.startedAt !== undefined ? { started_at: updates.startedAt } : {}),
                    ...(updates.completedAt !== undefined ? { completed_at: updates.completedAt } : {})
                })
                .where('id', '=', id)
                .execute(),
            (e) => new PersistenceError(`Failed to update workflow run: ${e}`)
        ).map(() => undefined);
    }

    getWorkflowRun(id: string): ResultAsync<WorkflowRunRecord | null, PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.selectFrom('workflow_runs')
                .selectAll()
                .where('id', '=', id)
                .executeTakeFirst(),
            (e) => new PersistenceError(`Failed to get workflow run: ${e}`)
        ).map(row => row ? this.mapToWorkflowRun(row) : null);
    }

    getWorkflowRuns(limit: number = 100): ResultAsync<WorkflowRunRecord[], PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.selectFrom('workflow_runs')
                .selectAll()
                .orderBy('started_at', 'desc')
                .limit(limit)
                .execute(),
            (e) => new PersistenceError(`Failed to get workflow runs: ${e}`)
        ).map(rows => rows.map(row => this.mapToWorkflowRun(row)));
    }

    saveWorkflowStepRun(stepRun: WorkflowStepRunRecord): ResultAsync<void, PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.insertInto('workflow_step_runs')
                .values({
                    id: stepRun.id,
                    workflow_run_id: stepRun.workflowRunId,
                    step_id: stepRun.stepId,
                    step_index: stepRun.stepIndex,
                    test_run_id: stepRun.testRunId ?? null,
                    status: stepRun.status,
                    summary: stepRun.summary ?? null,
                    started_at: stepRun.startedAt,
                    completed_at: stepRun.completedAt ?? null
                })
                .execute(),
            (e) => new PersistenceError(`Failed to save workflow step run: ${e}`)
        ).map(() => undefined);
    }

    updateWorkflowStepRun(id: string, updates: Partial<WorkflowStepRunRecord>): ResultAsync<void, PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.updateTable('workflow_step_runs')
                .set({
                    ...(updates.workflowRunId !== undefined ? { workflow_run_id: updates.workflowRunId } : {}),
                    ...(updates.stepId !== undefined ? { step_id: updates.stepId } : {}),
                    ...(updates.stepIndex !== undefined ? { step_index: updates.stepIndex } : {}),
                    ...(updates.testRunId !== undefined ? { test_run_id: updates.testRunId } : {}),
                    ...(updates.status !== undefined ? { status: updates.status } : {}),
                    ...(updates.summary !== undefined ? { summary: updates.summary } : {}),
                    ...(updates.startedAt !== undefined ? { started_at: updates.startedAt } : {}),
                    ...(updates.completedAt !== undefined ? { completed_at: updates.completedAt } : {})
                })
                .where('id', '=', id)
                .execute(),
            (e) => new PersistenceError(`Failed to update workflow step run: ${e}`)
        ).map(() => undefined);
    }

    getWorkflowStepRuns(workflowRunId: string): ResultAsync<WorkflowStepRunRecord[], PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.selectFrom('workflow_step_runs')
                .selectAll()
                .where('workflow_run_id', '=', workflowRunId)
                .orderBy('step_index', 'asc')
                .execute(),
            (e) => new PersistenceError(`Failed to get workflow step runs: ${e}`)
        ).map(rows => rows.map(row => this.mapToWorkflowStepRun(row)));
    }

    commitAtomicWorkflowTransition(input: AtomicWorkflowTransitionInput): ResultAsync<void, PersistenceError> {
        return ResultAsync.fromPromise(
            Promise.resolve().then(() => {
                const tx = this.database.transaction((payload: AtomicWorkflowTransitionInput) => {
                    const workflowStepSetClauses: string[] = ['status = @step_status'];
                    const workflowRunSetClauses: string[] = ['status = @run_status'];

                    if (payload.workflowStepRunUpdates.summary !== undefined) {
                        workflowStepSetClauses.push('summary = @step_summary');
                    }
                    if (payload.workflowStepRunUpdates.completedAt !== undefined) {
                        workflowStepSetClauses.push('completed_at = @step_completed_at');
                    }
                    if (payload.workflowStepRunUpdates.testRunId !== undefined) {
                        workflowStepSetClauses.push('test_run_id = @step_test_run_id');
                    }

                    if (payload.workflowRunUpdates.summary !== undefined) {
                        workflowRunSetClauses.push('summary = @run_summary');
                    }
                    if (payload.workflowRunUpdates.completedAt !== undefined) {
                        workflowRunSetClauses.push('completed_at = @run_completed_at');
                    }

                    this.database.prepare(`
                        UPDATE workflow_step_runs
                        SET ${workflowStepSetClauses.join(', ')}
                        WHERE id = @step_run_id
                    `).run({
                        step_status: payload.workflowStepRunUpdates.status,
                        step_summary: payload.workflowStepRunUpdates.summary ?? null,
                        step_completed_at: payload.workflowStepRunUpdates.completedAt ?? null,
                        step_test_run_id: payload.workflowStepRunUpdates.testRunId ?? null,
                        step_run_id: payload.workflowStepRunId
                    });

                    this.database.prepare(`
                        UPDATE workflow_runs
                        SET ${workflowRunSetClauses.join(', ')}
                        WHERE id = @workflow_run_id
                    `).run({
                        run_status: payload.workflowRunUpdates.status,
                        run_summary: payload.workflowRunUpdates.summary ?? null,
                        run_completed_at: payload.workflowRunUpdates.completedAt ?? null,
                        workflow_run_id: payload.workflowRunId
                    });
                });

                tx(input);
            }),
            (e) => new PersistenceError(`Failed to commit atomic workflow transition: ${e}`)
        ).map(() => undefined);
    }

    private mapToWorkflowDefinition(row: WorkflowDefinitionTable): WorkflowDefinition {
        return {
            id: row.id,
            name: row.name,
            ...(row.description ? { description: row.description } : {}),
            status: row.status as WorkflowDefinition['status'],
            version: row.version,
            platformConfig: JSON.parse(row.platform_config_json),
            steps: JSON.parse(row.steps_json),
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }

    private mapToWorkflowRun(row: WorkflowRunTable): WorkflowRunRecord {
        return {
            id: row.id,
            workflowDefinitionId: row.workflow_definition_id,
            workflowVersion: row.workflow_version,
            status: row.status as WorkflowRunRecord['status'],
            ...(row.summary ? { summary: row.summary } : {}),
            startedAt: row.started_at,
            ...(row.completed_at ? { completedAt: row.completed_at } : {})
        };
    }

    private mapToWorkflowStepRun(row: WorkflowStepRunTable): WorkflowStepRunRecord {
        return {
            id: row.id,
            workflowRunId: row.workflow_run_id,
            stepId: row.step_id,
            stepIndex: row.step_index,
            ...(row.test_run_id ? { testRunId: row.test_run_id } : {}),
            status: row.status as WorkflowStepRunRecord['status'],
            ...(row.summary ? { summary: row.summary } : {}),
            startedAt: row.started_at,
            ...(row.completed_at ? { completedAt: row.completed_at } : {})
        };
    }
}
