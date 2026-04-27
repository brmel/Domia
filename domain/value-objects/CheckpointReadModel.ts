import type { WorkflowState } from './WorkflowState';
import type { CheckpointReason } from './CheckpointReason';

export interface CheckpointRecord {
    readonly runId: string;
    readonly checkpointId: string;
    readonly createdAt: string;
    readonly reason: CheckpointReason;
    readonly state: WorkflowState;
}
