import type { WorkflowState } from './WorkflowState';
import type { RunCheckpointReason } from './RunLifecycle';

export interface CheckpointRecord {
    readonly runId: string;
    readonly checkpointId: string;
    readonly createdAt: string;
    readonly reason: RunCheckpointReason;
    readonly state: WorkflowState;
}
