import { ResultAsync } from 'neverthrow';
import { PersistenceError } from '@domain/errors';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import type { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';
import type { CheckpointMetadata } from '@domain/value-objects/CheckpointMetadata';

export interface ICheckpointRepository {
    saveCheckpoint(
        runId: string,
        state: WorkflowState,
        reason: CheckpointReason,
        metadata?: CheckpointMetadata,
    ): ResultAsync<void, PersistenceError>;
    getCheckpointRecords(runId: string): ResultAsync<CheckpointRecord[], PersistenceError>;
    /** Prune all but the most recent `keep` `action_applied` checkpoints for a run (W18). Suspend/terminal checkpoints are never pruned. */
    pruneActionCheckpoints(runId: string, keep: number): ResultAsync<void, PersistenceError>;
}
