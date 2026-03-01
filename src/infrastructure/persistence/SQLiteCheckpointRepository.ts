import { ResultAsync } from 'neverthrow';
import { Kysely } from 'kysely';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import type { RunCheckpointReason } from '@domain/value-objects/RunLifecycle';
import type { CheckpointLineageInput } from '@domain/ports/IPersistenceAdapter';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';
import { PersistenceError } from '@domain/errors';
import type { DatabaseSchema } from './DatabaseSchema';

export class SQLiteCheckpointRepository {
    constructor(private readonly db: Kysely<DatabaseSchema>) {}

    saveCheckpoint(
        runId: string,
        state: WorkflowState,
        reason: RunCheckpointReason,
        lineage: CheckpointLineageInput
    ): ResultAsync<void, PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.insertInto('workflow_checkpoints')
                .values({
                    run_id: runId,
                    checkpoint_id: lineage.checkpointId,
                    parent_checkpoint_id: lineage.parentCheckpointId,
                    branch_id: lineage.branchId,
                    sequence_number: lineage.sequenceNumber,
                    commit_boundary: lineage.commitBoundary ? 1 : 0,
                    side_effect_set_hash: lineage.sideEffectSetHash,
                    state_json: JSON.stringify(state),
                    reason,
                    created_at: new Date().toISOString()
                })
                .execute(),
            (e) => new PersistenceError(`Failed to save checkpoint: ${e}`)
        ).map(() => undefined);
    }

    getCheckpointRecords(runId: string): ResultAsync<CheckpointRecord[], PersistenceError> {
        return ResultAsync.fromPromise(
            this.db.selectFrom('workflow_checkpoints')
                .select([
                    'run_id',
                    'checkpoint_id',
                    'parent_checkpoint_id',
                    'branch_id',
                    'sequence_number',
                    'commit_boundary',
                    'side_effect_set_hash',
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
            commitBoundary: row.commit_boundary === 1,
            sideEffectSetHash: row.side_effect_set_hash,
            createdAt: row.created_at,
            reason: row.reason as RunCheckpointReason,
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
