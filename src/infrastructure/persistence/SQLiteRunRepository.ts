import { ResultAsync } from 'neverthrow';
import { Kysely } from 'kysely';
import type { Step } from '@domain/ports';
import { Run, RunStatus } from '@domain/entities/Run';
import { RunId, Url } from '@domain/value-objects';
import { PersistenceError } from '@domain/errors';
import type { DatabaseSchema, RunTable, StepTable } from './DatabaseSchema';

export class SQLiteRunRepository {
    constructor(private readonly db: Kysely<DatabaseSchema>) {}

    saveRun(run: Run): ResultAsync<void, PersistenceError> {
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
            (e) => new PersistenceError(`Failed to save run: ${e}`)
        ).map(() => undefined);
    }

    updateRun(id: string, updates: Partial<Run>): ResultAsync<void, PersistenceError> {
        const values: Partial<RunTable> = {};

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
            this.db.updateTable('runs')
                .set(values)
                .where('id', '=', id)
                .execute(),
            (e) => new PersistenceError(`Failed to update run: ${e}`)
        ).map(() => undefined);
    }

    saveStep(step: Step): ResultAsync<void, PersistenceError> {
        return ResultAsync.fromPromise(
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
            (e) => new PersistenceError(`Failed to save step: ${e}`)
        ).map(() => undefined);
    }

    getRuns(limit: number = 50): ResultAsync<Run[], PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.selectFrom('runs')
                .selectAll()
                .orderBy('started_at', 'desc')
                .limit(limit)
                .execute(),
            (e) => new PersistenceError(`Failed to get runs: ${e}`)
        ).map(rows => rows.map(row => this.mapToRun(row)));
    }

    getRun(id: string): ResultAsync<Run | null, PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.selectFrom('runs')
                .selectAll()
                .where('id', '=', id)
                .executeTakeFirst(),
            (e) => new PersistenceError(`Failed to get run: ${e}`)
        ).map(row => row ? this.mapToRun(row) : null);
    }

    getSteps(runId: string): ResultAsync<Step[], PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.selectFrom('steps')
                .selectAll()
                .where('run_id', '=', runId)
                .orderBy('step_number', 'asc')
                .execute(),
            (e) => new PersistenceError(`Failed to get steps: ${e}`)
        ).map(rows => rows.map(row => this.mapToStep(row)));
    }

    clearHistory(db: Kysely<DatabaseSchema>): ResultAsync<void, PersistenceError> {
        return ResultAsync.fromPromise(
            (async (): Promise<void> => {
                await db.deleteFrom('steps').execute();
                await db.deleteFrom('logs').execute();
                await db.deleteFrom('workflow_checkpoints').execute();
                await db.deleteFrom('replay_idempotency_keys').execute();
                await db.deleteFrom('workflow_step_runs').execute();
                await db.deleteFrom('workflow_runs').execute();
                await db.deleteFrom('workflow_definitions').execute();
                await db.deleteFrom('runs').execute();
            })(),
            (e) => new PersistenceError(`Failed to clear history: ${e}`)
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
            actionType: row.action_type as import('@domain/enums/ActionType').ActionType,
            actionPayload: action,
            assets: row.assets_json ? JSON.parse(row.assets_json) : undefined,
            timestamp: row.timestamp
        };
    }
}
