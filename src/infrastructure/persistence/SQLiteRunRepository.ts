import { ResultAsync } from 'neverthrow';
import { Kysely } from 'kysely';
import type { Step } from '@domain/ports';
import { Run, RunStatus } from '@domain/entities/Run';
import { RunId, Url } from '@domain/value-objects';
import { PersistenceError } from '@domain/errors';
import type { DatabaseSchema, RunTable, StepTable } from './DatabaseSchema';
import { DEFAULT_RUNS_QUERY_LIMIT } from '@shared/defaults';
import { dbOp } from './dbOp';

/** Extract summary and durationMs from a RunStatus discriminated union. */
function extractStatusFields(status: RunStatus): { summary: string | null; durationMs: number | null } {
    switch (status.type) {
        case 'passed':    return { summary: status.summary, durationMs: status.duration };
        case 'failed':    return { summary: status.error,   durationMs: status.duration };
        case 'cancelled': return { summary: status.reason,  durationMs: null };
        default:          return { summary: null,           durationMs: null };
    }
}

export class SQLiteRunRepository {
    constructor(private readonly db: Kysely<DatabaseSchema>) {}

    saveRun(run: Run): ResultAsync<void, PersistenceError> {
        const { summary, durationMs } = extractStatusFields(run.status);
        const startedAt = run.startedAt ? run.startedAt.toISOString() : run.createdAt.toISOString();

        return dbOp(
            this.db.insertInto('runs')
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
            'save run'
        ).map(() => undefined);
    }

    updateRun(id: string, updates: Partial<Run>): ResultAsync<void, PersistenceError> {
        const values: Partial<RunTable> = {};

        if (updates.status) {
            values.status = updates.status.type;
            const { summary, durationMs } = extractStatusFields(updates.status);
            values.summary = summary;
            values.duration_ms = durationMs;
        }

        if (updates.startedAt) values.started_at = updates.startedAt.toISOString();

        if (updates.status && ['passed', 'failed', 'cancelled'].includes(updates.status.type)) {
            values.completed_at = new Date().toISOString();
        }

        return dbOp(
            this.db.updateTable('runs')
                .set(values)
                .where('id', '=', id)
                .execute(),
            'update run'
        ).map(() => undefined);
    }

    saveStep(step: Step): ResultAsync<void, PersistenceError> {
        return dbOp(
            this.db.insertInto('steps')
                .values({
                    id: step.id,
                    run_id: step.runId,
                    step_number: step.stepNumber,
                    action_type: step.actionType,
                    action_payload: JSON.stringify(step.actionPayload),
                    assets_json: step.assets ? JSON.stringify(step.assets) : null,
                    timestamp: step.timestamp
                })
                .execute(),
            'save step'
        ).map(() => undefined);
    }

    getRuns(limit: number = DEFAULT_RUNS_QUERY_LIMIT): ResultAsync<Run[], PersistenceError> {
        return dbOp(
            this.db.selectFrom('runs')
                .selectAll()
                .orderBy('started_at', 'desc')
                .limit(limit)
                .execute(),
            'get runs'
        ).map(rows => rows.map(row => this.mapToRun(row)));
    }

    getRun(id: string): ResultAsync<Run | null, PersistenceError> {
        return dbOp(
            this.db.selectFrom('runs')
                .selectAll()
                .where('id', '=', id)
                .executeTakeFirst(),
            'get run'
        ).map(row => row ? this.mapToRun(row) : null);
    }

    getSteps(runId: string): ResultAsync<Step[], PersistenceError> {
        return dbOp(
            this.db.selectFrom('steps')
                .selectAll()
                .where('run_id', '=', runId)
                .orderBy('step_number', 'asc')
                .execute(),
            'get steps'
        ).map(rows => rows.map(row => this.mapToStep(row)));
    }

    getStep(runId: string, stepNumber: number): ResultAsync<Step | null, PersistenceError> {
        return dbOp(
            this.db.selectFrom('steps')
                .selectAll()
                .where('run_id', '=', runId)
                .where('step_number', '=', stepNumber)
                .executeTakeFirst(),
            'get step'
        ).map(row => row ? this.mapToStep(row) : null);
    }

    clearHistory(): ResultAsync<void, PersistenceError> {
        return dbOp(
            (async (): Promise<void> => {
                await this.db.deleteFrom('steps').execute();
                await this.db.deleteFrom('workflow_checkpoints').execute();
                await this.db.deleteFrom('workflow_step_runs').execute();
                await this.db.deleteFrom('workflow_runs').execute();
                await this.db.deleteFrom('workflow_definitions').execute();
                await this.db.deleteFrom('runs').execute();
            })(),
            'clear history'
        ).map(() => undefined);
    }

    private mapToRun(row: RunTable): Run {
        let status: RunStatus;

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
            id: row.id as RunId,
            url: row.url as Url,
            prompt: row.goal || '',
            status: status,
            createdAt: new Date(row.started_at),
            startedAt: new Date(row.started_at),
            updatedAt: row.completed_at ? new Date(row.completed_at) : new Date(row.started_at)
        };
    }

    private mapToStep(row: StepTable): Step {
        const action = JSON.parse(row.action_payload);
        return {
            id: row.id,
            runId: row.run_id,
            stepNumber: row.step_number,
            actionType: row.action_type as import('@domain/enums').ActionType,
            actionPayload: action,
            assets: row.assets_json ? JSON.parse(row.assets_json) : undefined,
            timestamp: row.timestamp
        };
    }
}
