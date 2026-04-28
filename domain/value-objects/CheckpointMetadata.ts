export type CheckpointMetadata =
    | { reason: 'run_suspended'; conversationSnapshotPath: string }
    | { reason: 'run_resumed'; conversationSnapshotPath: string };
