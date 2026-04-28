export interface ActionRecordingData {
    readonly toolName: string;
    readonly startedAt: string;
    readonly durationMs: number;
    readonly frames: readonly ActionRecordingFrameData[];
}

interface ActionRecordingFrameData {
    readonly offsetMs: number;
    readonly screenshot: Buffer;
}
