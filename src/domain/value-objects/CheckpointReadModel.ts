import type { WorkflowState } from './WorkflowState';
import type { RunCheckpointReason } from './RunLifecycle';

export interface CheckpointRecord {
    readonly runId: string;
    readonly createdAt: string;
    readonly reason: RunCheckpointReason;
    readonly state: WorkflowState;
}

export interface CheckpointCompactionPolicy {
    readonly keepEveryNth: number;
    readonly maxRecent: number;
}

export interface CompactedCheckpointView {
    readonly runId: string;
    readonly latest: CheckpointRecord | null;
    readonly compacted: readonly CheckpointRecord[];
}

export interface RecoveryReadModel {
    readonly runId: string;
    readonly canResume: boolean;
    readonly lastStableStepNumber: number;
    readonly suggestedStartStep: number;
    readonly reason: string;
}
