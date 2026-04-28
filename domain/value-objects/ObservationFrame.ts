import type { RunId } from './Brand';

export interface FrameAttachment {
    readonly id: string;
    readonly contentType: string;
    readonly inline?: string;
    readonly path?: string;
    readonly bytes: number;
}

export interface ObservationFrame {
    readonly runId: RunId;
    readonly capturedAt: number;
    readonly source: string;
    readonly summary: string;
    readonly attachments: readonly FrameAttachment[];
}
