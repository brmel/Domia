import { ResultAsync } from 'neverthrow';
import { PersistenceError } from '@domain/errors';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import type { RunCheckpointReason } from '@domain/value-objects/RunLifecycle';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';

export interface ICheckpointRepository {
    saveCheckpoint(
        runId: string,
        state: WorkflowState,
        reason: RunCheckpointReason
    ): ResultAsync<void, PersistenceError>;
    getCheckpointRecords(runId: string): ResultAsync<CheckpointRecord[], PersistenceError>;
}
