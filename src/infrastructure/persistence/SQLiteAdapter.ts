import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import type { Database as SqlJsDatabase } from 'sql.js';
import { Kysely } from 'kysely';
import { SqlJsDialect } from 'kysely-wasm';
import { IPersistenceAdapter, Step } from '@domain/ports';
import { Run } from '@domain/entities/Run';
import type { WorkflowDefinition, WorkflowRunRecord, WorkflowStepRunRecord } from '@domain/entities/Workflow';
import type { AtomicWorkflowTransitionInput } from '@domain/ports/IPersistenceAdapter';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import type { RunCheckpointReason } from '@domain/value-objects/RunLifecycle';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';
import { PersistenceError } from '@domain/errors';
import { ConfigService } from '../ConfigService';
import type { DatabaseSchema } from './DatabaseSchema';
import { initializeSchema } from './SQLiteMigrationManager';
import { SQLiteRunRepository } from './SQLiteRunRepository';
import { SQLiteCheckpointRepository } from './SQLiteCheckpointRepository';
import { SQLiteWorkflowRepository } from './SQLiteWorkflowRepository';
import { openDatabase, saveDatabase } from './SqlJsProvider';
import { DEFAULT_RUNS_QUERY_LIMIT, DEFAULT_WORKFLOWS_QUERY_LIMIT } from '@shared/defaults';

export { SQLITE_MIGRATION_IDS } from './SQLiteMigrationManager';

@injectable()
export class SQLiteAdapter implements IPersistenceAdapter {
    private db!: Kysely<DatabaseSchema>;
    private raw!: SqlJsDatabase;
    private runs!: SQLiteRunRepository;
    private checkpoints!: SQLiteCheckpointRepository;
    private workflows!: SQLiteWorkflowRepository;
    private dbPath: string;
    private readonly ready: Promise<void>;

    constructor(@inject(ConfigService) configService: ConfigService) {
        const config = configService.get();
        this.dbPath = config.paths.databasePath;
        this.ready = this.initialize();
    }

    private async initialize(): Promise<void> {
        this.raw = await openDatabase(this.dbPath);

        this.db = new Kysely<DatabaseSchema>({
            dialect: new SqlJsDialect({ database: this.raw }),
        });

        initializeSchema(this.raw);

        this.runs = new SQLiteRunRepository(this.db);
        this.checkpoints = new SQLiteCheckpointRepository(this.db);
        this.workflows = new SQLiteWorkflowRepository(this.db, this.raw);
    }

    private persist(): void {
        saveDatabase(this.raw, this.dbPath);
    }

    private withPersist<T>(op: () => ResultAsync<T, PersistenceError>): ResultAsync<T, PersistenceError> {
        return ResultAsync.fromPromise(this.ready, (e) => new PersistenceError(`DB init failed: ${e}`))
            .andThen(() => op())
            .map((result) => { this.persist(); return result; });
    }

    private withReady<T>(op: () => ResultAsync<T, PersistenceError>): ResultAsync<T, PersistenceError> {
        return ResultAsync.fromPromise(this.ready, (e) => new PersistenceError(`DB init failed: ${e}`))
            .andThen(() => op());
    }

    saveRun(run: Run): ResultAsync<void, PersistenceError> {
        return this.withPersist(() => this.runs.saveRun(run));
    }

    updateRun(id: string, updates: Partial<Run>): ResultAsync<void, PersistenceError> {
        return this.withPersist(() => this.runs.updateRun(id, updates));
    }

    saveStep(step: Step): ResultAsync<void, PersistenceError> {
        return this.withPersist(() => this.runs.saveStep(step));
    }

    getRuns(limit: number = DEFAULT_RUNS_QUERY_LIMIT): ResultAsync<Run[], PersistenceError> {
        return this.withReady(() => this.runs.getRuns(limit));
    }

    getRun(id: string): ResultAsync<Run | null, PersistenceError> {
        return this.withReady(() => this.runs.getRun(id));
    }

    getSteps(runId: string): ResultAsync<Step[], PersistenceError> {
        return this.withReady(() => this.runs.getSteps(runId));
    }

    getStep(runId: string, stepNumber: number): ResultAsync<Step | null, PersistenceError> {
        return this.withReady(() => this.runs.getStep(runId, stepNumber));
    }

    clearHistory(): ResultAsync<void, PersistenceError> {
        return this.withPersist(() => this.runs.clearHistory());
    }

    saveCheckpoint(
        runId: string,
        state: WorkflowState,
        reason: RunCheckpointReason
    ): ResultAsync<void, PersistenceError> {
        return this.withPersist(() => this.checkpoints.saveCheckpoint(runId, state, reason));
    }

    getCheckpointRecords(runId: string): ResultAsync<CheckpointRecord[], PersistenceError> {
        return this.withReady(() => this.checkpoints.getCheckpointRecords(runId));
    }

    saveWorkflowDefinition(definition: WorkflowDefinition): ResultAsync<void, PersistenceError> {
        return this.withPersist(() => this.workflows.saveWorkflowDefinition(definition));
    }

    getWorkflowDefinition(id: string): ResultAsync<WorkflowDefinition | null, PersistenceError> {
        return this.withReady(() => this.workflows.getWorkflowDefinition(id));
    }

    getWorkflowDefinitions(limit: number = DEFAULT_WORKFLOWS_QUERY_LIMIT): ResultAsync<WorkflowDefinition[], PersistenceError> {
        return this.withReady(() => this.workflows.getWorkflowDefinitions(limit));
    }

    saveWorkflowRun(run: WorkflowRunRecord): ResultAsync<void, PersistenceError> {
        return this.withPersist(() => this.workflows.saveWorkflowRun(run));
    }

    updateWorkflowRun(id: string, updates: Partial<WorkflowRunRecord>): ResultAsync<void, PersistenceError> {
        return this.withPersist(() => this.workflows.updateWorkflowRun(id, updates));
    }

    getWorkflowRun(id: string): ResultAsync<WorkflowRunRecord | null, PersistenceError> {
        return this.withReady(() => this.workflows.getWorkflowRun(id));
    }

    getWorkflowRuns(limit: number = DEFAULT_WORKFLOWS_QUERY_LIMIT): ResultAsync<WorkflowRunRecord[], PersistenceError> {
        return this.withReady(() => this.workflows.getWorkflowRuns(limit));
    }

    saveWorkflowStepRun(stepRun: WorkflowStepRunRecord): ResultAsync<void, PersistenceError> {
        return this.withPersist(() => this.workflows.saveWorkflowStepRun(stepRun));
    }

    updateWorkflowStepRun(id: string, updates: Partial<WorkflowStepRunRecord>): ResultAsync<void, PersistenceError> {
        return this.withPersist(() => this.workflows.updateWorkflowStepRun(id, updates));
    }

    getWorkflowStepRuns(workflowRunId: string): ResultAsync<WorkflowStepRunRecord[], PersistenceError> {
        return this.withReady(() => this.workflows.getWorkflowStepRuns(workflowRunId));
    }

    commitAtomicWorkflowTransition(input: AtomicWorkflowTransitionInput): ResultAsync<void, PersistenceError> {
        return this.withPersist(() => this.workflows.commitAtomicWorkflowTransition(input));
    }
}
