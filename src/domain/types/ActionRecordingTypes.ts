/**
 * Domain-level representation of an action recording.
 * Infrastructure layer maps its own ActionRecording type to this.
 */
export interface ActionRecordingData {
    readonly toolName: string;
    readonly startedAt: string;
    readonly durationMs: number;
    readonly frames: readonly ActionRecordingFrameData[];
}

export interface ActionRecordingFrameData {
    readonly offsetMs: number;
    readonly screenshot: Buffer;
}
