import { Kysely } from 'kysely';
import { randomUUID } from 'crypto';
import type { ResultAsync } from 'neverthrow';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import type { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';
import type { CheckpointMetadata } from '@domain/value-objects/CheckpointMetadata';
import type { PersistenceError } from '@domain/errors';
import type { DatabaseSchema } from './DatabaseSchema';
import { dbOp } from './dbOp';

export class SQLiteCheckpointRepository {
    constructor(private readonly db: Kysely<DatabaseSchema>) {}

    saveCheckpoint(
        runId: string,
        state: WorkflowState,
        reason: CheckpointReason,
        metadata?: CheckpointMetadata,
    ): ResultAsync<void, PersistenceError> {
        return dbOp(
            this.db.insertInto('workflow_checkpoints')
                .values({
                    run_id: runId,
                    checkpoint_id: randomUUID(),
                    state_json: JSON.stringify(state),
                    reason,
                    created_at: new Date().toISOString(),
                    metadata_json: metadata ? JSON.stringify(metadata) : null,
                })
                .execute(),
            'save checkpoint'
        ).map(() => undefined);
    }

    getCheckpointRecords(runId: string): ResultAsync<CheckpointRecord[], PersistenceError> {
        return dbOp(
            this.db.selectFrom('workflow_checkpoints')
                .select(['run_id', 'checkpoint_id', 'state_json', 'reason', 'created_at', 'metadata_json'])
                .where('run_id', '=', runId)
                .orderBy('created_at', 'asc')
                .execute(),
            'get checkpoint records'
        ).map(rows => rows.map(row => ({
            runId: row.run_id,
            checkpointId: row.checkpoint_id,
            createdAt: row.created_at,
            reason: row.reason as CheckpointReason,
            state: JSON.parse(row.state_json),
            ...(row.metadata_json ? { metadata: JSON.parse(row.metadata_json) as CheckpointMetadata } : {}),
        })));
    }
}
