import { Kysely } from 'kysely';
import type { ResultAsync } from 'neverthrow';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import type { RunCheckpointReason } from '@domain/value-objects/RunLifecycle';
import type { CheckpointLineageInput } from '@domain/ports/IPersistenceAdapter';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';
import type { PersistenceError } from '@domain/errors';
import type { DatabaseSchema } from './DatabaseSchema';
import { dbOp } from './dbOp';

export class SQLiteCheckpointRepository {
    constructor(private readonly db: Kysely<DatabaseSchema>) {}

    saveCheckpoint(
        runId: string,
        state: WorkflowState,
        reason: RunCheckpointReason,
        lineage: CheckpointLineageInput
    ): ResultAsync<void, PersistenceError> {
        return dbOp(
            this.db.insertInto('workflow_checkpoints')
                .values({
                    run_id: runId,
                    checkpoint_id: lineage.checkpointId,
                    parent_checkpoint_id: null,
                    branch_id: '',
                    sequence_number: 0,
                    commit_boundary: 0,
                    side_effect_set_hash: null,
                    state_json: JSON.stringify(state),
                    reason,
                    created_at: new Date().toISOString()
                })
                .execute(),
            'save checkpoint'
        ).map(() => undefined);
    }

    getCheckpointRecords(runId: string): ResultAsync<CheckpointRecord[], PersistenceError> {
        return dbOp(
            this.db.selectFrom('workflow_checkpoints')
                .select(['run_id', 'checkpoint_id', 'state_json', 'reason', 'created_at'])
                .where('run_id', '=', runId)
                .orderBy('created_at', 'asc')
                .execute(),
            'get checkpoint records'
        ).map(rows => rows.map(row => ({
            runId: row.run_id,
            checkpointId: row.checkpoint_id,
            createdAt: row.created_at,
            reason: row.reason as RunCheckpointReason,
            state: JSON.parse(row.state_json)
        })));
    }
}
