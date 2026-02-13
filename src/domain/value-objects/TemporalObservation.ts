export interface SnapshotFrame {
    readonly timestamp: number;
    readonly intervalMs: number;
    readonly domHash?: string;
    readonly screenshotPath?: string;
    readonly note?: string;
}

export interface SnapshotTimeline {
    readonly runId: string;
    readonly mode: 'baseline' | 'burst';
    readonly frames: readonly SnapshotFrame[];
}

export interface TemporalObservationConfig {
    readonly baselineIntervalMs: number;
    readonly burstIntervalMs: number;
    readonly burstMaxFrames: number;
    readonly maxFramesPerWindow: number;
}

export interface TimelineContextWindow {
    readonly runId: string;
    readonly fromTimestamp: number;
    readonly toTimestamp: number;
    readonly frames: readonly SnapshotFrame[];
    readonly summary: string;
}
