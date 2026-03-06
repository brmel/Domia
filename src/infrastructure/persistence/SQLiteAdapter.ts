import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import fs from 'fs-extra';
import path from 'path';
import { IPersistenceAdapter, Step } from '@domain/ports';
import { Run } from '@domain/entities/Run';
import type { WorkflowDefinition, WorkflowRunRecord, WorkflowStepRunRecord } from '@domain/entities/Workflow';
import type { AtomicWorkflowTransitionInput } from '@domain/ports/IPersistenceAdapter';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import type { RunCheckpointReason } from '@domain/value-objects/RunLifecycle';
import type { CheckpointLineageInput } from '@domain/ports/IPersistenceAdapter';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';
import { PersistenceError } from '@domain/errors';
import { ConfigService } from '../config/ConfigService';
import type { DatabaseSchema } from './DatabaseSchema';
import { initializeSchema } from './SQLiteMigrationManager';
import { SQLiteRunRepository } from './SQLiteRunRepository';
import { SQLiteCheckpointRepository } from './SQLiteCheckpointRepository';
import { SQLiteWorkflowRepository } from './SQLiteWorkflowRepository';
import { DEFAULT_RUNS_QUERY_LIMIT, DEFAULT_WORKFLOWS_QUERY_LIMIT } from '@shared/defaults';

export { SQLITE_MIGRATION_IDS } from './SQLiteMigrationManager';

@injectable()
export class SQLiteAdapter implements IPersistenceAdapter {
    private db: Kysely<DatabaseSchema>;
    private runs: SQLiteRunRepository;
    private checkpoints: SQLiteCheckpointRepository;
    private workflows: SQLiteWorkflowRepository;

    constructor(@inject(ConfigService) configService: ConfigService) {
        const config = configService.get();
        const dbPath = config.paths.databasePath;

        fs.ensureDirSync(path.dirname(dbPath));

        const database = new Database(dbPath);
        this.db = new Kysely<DatabaseSchema>({
            dialect: new SqliteDialect({ database }),
        });

        initializeSchema(database);

        this.runs = new SQLiteRunRepository(this.db);
        this.checkpoints = new SQLiteCheckpointRepository(this.db);
        this.workflows = new SQLiteWorkflowRepository(this.db, database);
    }

    saveRun(run: Run): ResultAsync<void, PersistenceError> {
        return this.runs.saveRun(run);
    }

    updateRun(id: string, updates: Partial<Run>): ResultAsync<void, PersistenceError> {
        return this.runs.updateRun(id, updates);
    }

    saveStep(step: Step): ResultAsync<void, PersistenceError> {
        return this.runs.saveStep(step);
    }

    getRuns(limit: number = DEFAULT_RUNS_QUERY_LIMIT): ResultAsync<Run[], PersistenceError> {
        return this.runs.getRuns(limit);
    }

    getRun(id: string): ResultAsync<Run | null, PersistenceError> {
        return this.runs.getRun(id);
    }

    getSteps(runId: string): ResultAsync<Step[], PersistenceError> {
        return this.runs.getSteps(runId);
    }

    getStep(runId: string, stepNumber: number): ResultAsync<Step | null, PersistenceError> {
        return this.runs.getStep(runId, stepNumber);
    }

    clearHistory(): ResultAsync<void, PersistenceError> {
        return this.runs.clearHistory();
    }

    saveCheckpoint(
        runId: string,
        state: WorkflowState,
        reason: RunCheckpointReason,
        lineage: CheckpointLineageInput
    ): ResultAsync<void, PersistenceError> {
        return this.checkpoints.saveCheckpoint(runId, state, reason, lineage);
    }

    getCheckpointRecords(runId: string): ResultAsync<CheckpointRecord[], PersistenceError> {
        return this.checkpoints.getCheckpointRecords(runId);
    }

    saveWorkflowDefinition(definition: WorkflowDefinition): ResultAsync<void, PersistenceError> {
        return this.workflows.saveWorkflowDefinition(definition);
    }

    getWorkflowDefinition(id: string): ResultAsync<WorkflowDefinition | null, PersistenceError> {
        return this.workflows.getWorkflowDefinition(id);
    }

    getWorkflowDefinitions(limit: number = DEFAULT_WORKFLOWS_QUERY_LIMIT): ResultAsync<WorkflowDefinition[], PersistenceError> {
        return this.workflows.getWorkflowDefinitions(limit);
    }

    saveWorkflowRun(run: WorkflowRunRecord): ResultAsync<void, PersistenceError> {
        return this.workflows.saveWorkflowRun(run);
    }

    updateWorkflowRun(id: string, updates: Partial<WorkflowRunRecord>): ResultAsync<void, PersistenceError> {
        return this.workflows.updateWorkflowRun(id, updates);
    }

    getWorkflowRun(id: string): ResultAsync<WorkflowRunRecord | null, PersistenceError> {
        return this.workflows.getWorkflowRun(id);
    }

    getWorkflowRuns(limit: number = DEFAULT_WORKFLOWS_QUERY_LIMIT): ResultAsync<WorkflowRunRecord[], PersistenceError> {
        return this.workflows.getWorkflowRuns(limit);
    }

    saveWorkflowStepRun(stepRun: WorkflowStepRunRecord): ResultAsync<void, PersistenceError> {
        return this.workflows.saveWorkflowStepRun(stepRun);
    }

    updateWorkflowStepRun(id: string, updates: Partial<WorkflowStepRunRecord>): ResultAsync<void, PersistenceError> {
        return this.workflows.updateWorkflowStepRun(id, updates);
    }

    getWorkflowStepRuns(workflowRunId: string): ResultAsync<WorkflowStepRunRecord[], PersistenceError> {
        return this.workflows.getWorkflowStepRuns(workflowRunId);
    }

    commitAtomicWorkflowTransition(input: AtomicWorkflowTransitionInput): ResultAsync<void, PersistenceError> {
        return this.workflows.commitAtomicWorkflowTransition(input);
    }
}
