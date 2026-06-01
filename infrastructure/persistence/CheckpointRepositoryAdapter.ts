import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import type { ICheckpointRepository } from '@domain/ports/persistence/ICheckpointRepository';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import type { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';
import type { CheckpointMetadata } from '@domain/value-objects/CheckpointMetadata';
import { PersistenceError } from '@domain/errors';
import { SqlJsConnection } from './SqlJsConnection';

/** Persist-aware ICheckpointRepository bound to the 'ICheckpointRepository' token. */
@injectable()
export class CheckpointRepositoryAdapter implements ICheckpointRepository {
    constructor(@inject(SqlJsConnection) private readonly conn: SqlJsConnection) {}

    saveCheckpoint(
        runId: string,
        state: WorkflowState,
        reason: CheckpointReason,
        metadata?: CheckpointMetadata,
    ): ResultAsync<void, PersistenceError> {
        return this.conn.withPersist(() => this.conn.checkpoints().saveCheckpoint(runId, state, reason, metadata));
    }
    getCheckpointRecords(runId: string): ResultAsync<CheckpointRecord[], PersistenceError> {
        return this.conn.withReady(() => this.conn.checkpoints().getCheckpointRecords(runId));
    }
    pruneActionCheckpoints(runId: string, keep: number): ResultAsync<void, PersistenceError> {
        return this.conn.withPersist(() => this.conn.checkpoints().pruneActionCheckpoints(runId, keep));
    }
}
