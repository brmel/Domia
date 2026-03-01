import { ResultAsync } from 'neverthrow';
import { PersistenceError } from '@domain/errors';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import type { RunCheckpointReason } from '@domain/value-objects/RunLifecycle';
import type { CheckpointLineageInput } from './IPersistenceAdapter';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';

export interface ICheckpointRepository {
    saveCheckpoint(
        runId: string,
        state: WorkflowState,
        reason: RunCheckpointReason,
        lineage: CheckpointLineageInput
    ): ResultAsync<void, PersistenceError>;
    getCheckpointRecords(runId: string): ResultAsync<CheckpointRecord[], PersistenceError>;
    saveReplayIdempotencyKey(runId: string, idempotencyKey: string): ResultAsync<void, PersistenceError>;
    hasReplayIdempotencyKey(runId: string, idempotencyKey: string): ResultAsync<boolean, PersistenceError>;
}
