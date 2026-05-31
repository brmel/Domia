import { ResultAsync } from 'neverthrow';
import type { Database as SqlJsDatabase } from 'sql.js';
import { Kysely } from 'kysely';
import type { WorkflowDefinition, WorkflowRunRecord, WorkflowStepRunRecord } from '@domain/entities/Workflow';
import type { AtomicWorkflowTransitionInput } from '@domain/ports/persistence/IWorkflowRepository';
import { PersistenceError } from '@domain/errors';
import type { DatabaseSchema } from './DatabaseSchema';
import { DEFAULT_WORKFLOWS_QUERY_LIMIT } from '@shared/defaults';
import { dbOp } from './dbOp';
import { rowToWorkflowDefinition, rowToWorkflowRun, rowToWorkflowStepRun } from './workflowRowMappers';
import { commitAtomicWorkflowTransition as runAtomicTransition } from './workflowAtomicTransition';

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
        ).map(row => row ? rowToWorkflowDefinition(row) : null);
    }

    getWorkflowDefinitions(limit: number = DEFAULT_WORKFLOWS_QUERY_LIMIT): ResultAsync<WorkflowDefinition[], PersistenceError> {
        return dbOp(
            this.db.selectFrom('workflow_definitions')
                .selectAll()
                .orderBy('updated_at', 'desc')
                .limit(limit)
                .execute(),
            'get workflow definitions'
        ).map(rows => rows.map(rowToWorkflowDefinition));
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
        ).map(row => row ? rowToWorkflowRun(row) : null);
    }

    getWorkflowRuns(limit: number = DEFAULT_WORKFLOWS_QUERY_LIMIT): ResultAsync<WorkflowRunRecord[], PersistenceError> {
        return dbOp(
            this.db.selectFrom('workflow_runs')
                .selectAll()
                .orderBy('started_at', 'desc')
                .limit(limit)
                .execute(),
            'get workflow runs'
        ).map(rows => rows.map(rowToWorkflowRun));
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
        ).map(rows => rows.map(rowToWorkflowStepRun));
    }

    commitAtomicWorkflowTransition(input: AtomicWorkflowTransitionInput): ResultAsync<void, PersistenceError> {
        return dbOp(
            Promise.resolve().then(() => runAtomicTransition(this.database, input)),
            'commit atomic workflow transition'
        ).map(() => undefined);
    }

}
