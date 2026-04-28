import type { WorkflowState } from './WorkflowState';
import type { CheckpointReason } from './CheckpointReason';
import type { CheckpointMetadata } from './CheckpointMetadata';

export interface CheckpointRecord {
    readonly runId: string;
    readonly checkpointId: string;
    readonly createdAt: string;
    readonly reason: CheckpointReason;
    readonly state: WorkflowState;
    readonly metadata?: CheckpointMetadata;
}
