import { ResultAsync } from 'neverthrow';
import type { Database as SqlJsDatabase } from 'sql.js';
import { Kysely } from 'kysely';
import type { WorkflowDefinition, WorkflowRunRecord, WorkflowStepRunRecord } from '@domain/entities/Workflow';
import type { AtomicWorkflowTransitionInput } from '@domain/ports/IPersistenceAdapter';
import { PersistenceError } from '@domain/errors';
import type { DatabaseSchema, WorkflowDefinitionTable, WorkflowRunTable, WorkflowStepRunTable } from './DatabaseSchema';
import { DEFAULT_WORKFLOWS_QUERY_LIMIT } from '@shared/defaults';
import { dbOp } from './dbOp';

export class SQLiteWorkflowRepository {
    constructor(
        private readonly db: Kysely<DatabaseSchema>,
        private readonly database: SqlJsDatabase
    ) {}

    saveWorkflowDefinition(definition: WorkflowDefinition): ResultAsync<void, PersistenceError> {
        return dbOp(
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
            'save workflow definition'
        ).map(() => undefined);
    }

    getWorkflowDefinition(id: string): ResultAsync<WorkflowDefinition | null, PersistenceError> {
        return dbOp(
            this.db.selectFrom('workflow_definitions')
                .selectAll()
                .where('id', '=', id)
                .executeTakeFirst(),
            'get workflow definition'
        ).map(row => row ? this.mapToWorkflowDefinition(row) : null);
    }

    getWorkflowDefinitions(limit: number = DEFAULT_WORKFLOWS_QUERY_LIMIT): ResultAsync<WorkflowDefinition[], PersistenceError> {
        return dbOp(
            this.db.selectFrom('workflow_definitions')
                .selectAll()
                .orderBy('updated_at', 'desc')
                .limit(limit)
                .execute(),
            'get workflow definitions'
        ).map(rows => rows.map(row => this.mapToWorkflowDefinition(row)));
    }

    saveWorkflowRun(run: WorkflowRunRecord): ResultAsync<void, PersistenceError> {
        return dbOp(
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
            'save workflow run'
        ).map(() => undefined);
    }

    updateWorkflowRun(id: string, updates: Partial<WorkflowRunRecord>): ResultAsync<void, PersistenceError> {
        return dbOp(
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
            'update workflow run'
        ).map(() => undefined);
    }

    getWorkflowRun(id: string): ResultAsync<WorkflowRunRecord | null, PersistenceError> {
        return dbOp(
            this.db.selectFrom('workflow_runs')
                .selectAll()
                .where('id', '=', id)
                .executeTakeFirst(),
            'get workflow run'
        ).map(row => row ? this.mapToWorkflowRun(row) : null);
    }

    getWorkflowRuns(limit: number = DEFAULT_WORKFLOWS_QUERY_LIMIT): ResultAsync<WorkflowRunRecord[], PersistenceError> {
        return dbOp(
            this.db.selectFrom('workflow_runs')
                .selectAll()
                .orderBy('started_at', 'desc')
                .limit(limit)
                .execute(),
            'get workflow runs'
        ).map(rows => rows.map(row => this.mapToWorkflowRun(row)));
    }

    saveWorkflowStepRun(stepRun: WorkflowStepRunRecord): ResultAsync<void, PersistenceError> {
        return dbOp(
            this.db.insertInto('workflow_step_runs')
                .values({
                    id: stepRun.id,
                    workflow_run_id: stepRun.workflowRunId,
                    step_id: stepRun.stepId,
                    step_index: stepRun.stepIndex,
                    run_id: stepRun.runId ?? null,
                    status: stepRun.status,
                    summary: stepRun.summary ?? null,
                    started_at: stepRun.startedAt,
                    completed_at: stepRun.completedAt ?? null
                })
                .execute(),
            'save workflow step run'
        ).map(() => undefined);
    }

    updateWorkflowStepRun(id: string, updates: Partial<WorkflowStepRunRecord>): ResultAsync<void, PersistenceError> {
        return dbOp(
            this.db.updateTable('workflow_step_runs')
                .set({
                    ...(updates.workflowRunId !== undefined ? { workflow_run_id: updates.workflowRunId } : {}),
                    ...(updates.stepId !== undefined ? { step_id: updates.stepId } : {}),
                    ...(updates.stepIndex !== undefined ? { step_index: updates.stepIndex } : {}),
                    ...(updates.runId !== undefined ? { run_id: updates.runId } : {}),
                    ...(updates.status !== undefined ? { status: updates.status } : {}),
                    ...(updates.summary !== undefined ? { summary: updates.summary } : {}),
                    ...(updates.startedAt !== undefined ? { started_at: updates.startedAt } : {}),
                    ...(updates.completedAt !== undefined ? { completed_at: updates.completedAt } : {})
                })
                .where('id', '=', id)
                .execute(),
            'update workflow step run'
        ).map(() => undefined);
    }

    getWorkflowStepRuns(workflowRunId: string): ResultAsync<WorkflowStepRunRecord[], PersistenceError> {
        return dbOp(
            this.db.selectFrom('workflow_step_runs')
                .selectAll()
                .where('workflow_run_id', '=', workflowRunId)
                .orderBy('step_index', 'asc')
                .execute(),
            'get workflow step runs'
        ).map(rows => rows.map(row => this.mapToWorkflowStepRun(row)));
    }

    commitAtomicWorkflowTransition(input: AtomicWorkflowTransitionInput): ResultAsync<void, PersistenceError> {
        return dbOp(
            Promise.resolve().then(() => {
                this.database.run('BEGIN TRANSACTION');
                try {
                    const stepSetClauses: string[] = ['status = ?'];
                    const stepParams: (string | null)[] = [input.workflowStepRunUpdates.status];

                    if (input.workflowStepRunUpdates.summary !== undefined) {
                        stepSetClauses.push('summary = ?');
                        stepParams.push(input.workflowStepRunUpdates.summary ?? null);
                    }
                    if (input.workflowStepRunUpdates.completedAt !== undefined) {
                        stepSetClauses.push('completed_at = ?');
                        stepParams.push(input.workflowStepRunUpdates.completedAt ?? null);
                    }
                    if (input.workflowStepRunUpdates.runId !== undefined) {
                        stepSetClauses.push('run_id = ?');
                        stepParams.push(input.workflowStepRunUpdates.runId ?? null);
                    }
                    stepParams.push(input.workflowStepRunId);

                    this.database.run(
                        `UPDATE workflow_step_runs SET ${stepSetClauses.join(', ')} WHERE id = ?`,
                        stepParams
                    );

                    const runSetClauses: string[] = ['status = ?'];
                    const runParams: (string | null)[] = [input.workflowRunUpdates.status];

                    if (input.workflowRunUpdates.summary !== undefined) {
                        runSetClauses.push('summary = ?');
                        runParams.push(input.workflowRunUpdates.summary ?? null);
                    }
                    if (input.workflowRunUpdates.completedAt !== undefined) {
                        runSetClauses.push('completed_at = ?');
                        runParams.push(input.workflowRunUpdates.completedAt ?? null);
                    }
                    runParams.push(input.workflowRunId);

                    this.database.run(
                        `UPDATE workflow_runs SET ${runSetClauses.join(', ')} WHERE id = ?`,
                        runParams
                    );

                    this.database.run('COMMIT');
                } catch (e) {
                    this.database.run('ROLLBACK');
                    throw e;
                }
            }),
            'commit atomic workflow transition'
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
            ...(row.run_id ? { runId: row.run_id } : {}),
            status: row.status as WorkflowStepRunRecord['status'],
            ...(row.summary ? { summary: row.summary } : {}),
            startedAt: row.started_at,
            ...(row.completed_at ? { completedAt: row.completed_at } : {})
        };
    }
}
