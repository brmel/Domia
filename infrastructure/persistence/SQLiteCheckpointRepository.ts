import { Kysely } from 'kysely';
import { randomUUID } from 'crypto';
import type { ResultAsync } from 'neverthrow';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';
import type { CheckpointMetadata } from '@domain/value-objects/CheckpointMetadata';
import type { PersistenceError } from '@domain/errors';
import type { DatabaseSchema } from './DatabaseSchema';
import { dbOp } from './dbOp';
import { packBlob, unpackBlob } from './blob';

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
                    state_json: packBlob(state),
                    reason,
                    created_at: new Date().toISOString(),
                    metadata_json: metadata ? packBlob(metadata) : null,
                })
                .execute(),
            'save checkpoint'
        ).map(() => undefined);
    }

    getCheckpointRecords(runId: string): ResultAsync<CheckpointRecord[], PersistenceError> {
        return dbOp(
            (async () => (await this.db.selectFrom('workflow_checkpoints')
                .select(['run_id', 'checkpoint_id', 'state_json', 'reason', 'created_at', 'metadata_json'])
                .where('run_id', '=', runId)
                .orderBy('created_at', 'asc')
                .execute()).map(row => ({
                    runId: row.run_id,
                    checkpointId: row.checkpoint_id,
                    createdAt: row.created_at,
                    reason: row.reason as CheckpointReason,
                    state: unpackBlob(row.state_json),
                    ...(row.metadata_json ? { metadata: unpackBlob<CheckpointMetadata>(row.metadata_json) } : {}),
                })))(),
            'get checkpoint records'
        );
    }

    pruneActionCheckpoints(runId: string, keep: number): ResultAsync<void, PersistenceError> {
        return dbOp(
            (async (): Promise<void> => {
                const survivors = await this.db.selectFrom('workflow_checkpoints')
                    .select('id')
                    .where('run_id', '=', runId)
                    .where('reason', '=', CheckpointReason.ActionApplied)
                    .orderBy('id', 'desc')
                    .limit(keep)
                    .execute();
                const keepIds = survivors.map((r) => r.id);

                let query = this.db.deleteFrom('workflow_checkpoints')
                    .where('run_id', '=', runId)
                    .where('reason', '=', CheckpointReason.ActionApplied);
                if (keepIds.length > 0) query = query.where('id', 'not in', keepIds);
                await query.execute();
            })(),
            'prune action checkpoints'
        ).map(() => undefined);
    }
}
