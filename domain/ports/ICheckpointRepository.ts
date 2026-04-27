import { ResultAsync } from 'neverthrow';
import { PersistenceError } from '@domain/errors';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import type { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';

export interface ICheckpointRepository {
    saveCheckpoint(
        runId: string,
        state: WorkflowState,
        reason: CheckpointReason
    ): ResultAsync<void, PersistenceError>;
    getCheckpointRecords(runId: string): ResultAsync<CheckpointRecord[], PersistenceError>;
}
