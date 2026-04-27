import type { ObservationFrame } from '@domain/value-objects/ObservationFrame';
import { OBSERVATION_RING_MAX_BYTES, OBSERVATION_RING_MAX_FRAMES } from '@shared/defaults';

export interface RingBufferLimits {
    readonly maxFrames: number;
    readonly maxBytes: number;
}

export class ObservationRingBuffer {
    private readonly frames: ObservationFrame[] = [];
    private bytesInUse = 0;

    constructor(private readonly limits: RingBufferLimits = {
        maxFrames: OBSERVATION_RING_MAX_FRAMES,
        maxBytes: OBSERVATION_RING_MAX_BYTES,
    }) {}

    push(frame: ObservationFrame): void {
        this.frames.push(frame);
        this.bytesInUse += this.frameBytes(frame);
        this.evictUntilWithinLimits();
    }

    sinceMs(elapsedMs: number, now: number = Date.now()): readonly ObservationFrame[] {
        const cutoff = now - elapsedMs;
        const start = this.frames.findIndex((f) => f.capturedAt >= cutoff);
        return start === -1 ? [] : this.frames.slice(start);
    }

    snapshot(): readonly ObservationFrame[] {
        return [...this.frames];
    }

    clear(): void {
        this.frames.length = 0;
        this.bytesInUse = 0;
    }

    get size(): number {
        return this.frames.length;
    }

    private frameBytes(frame: ObservationFrame): number {
        return frame.attachments.reduce((sum, a) => sum + a.bytes, 0);
    }

    private evictUntilWithinLimits(): void {
        while (
            this.frames.length > this.limits.maxFrames
            || this.bytesInUse > this.limits.maxBytes
        ) {
            const evicted = this.frames.shift();
            if (!evicted) return;
            this.bytesInUse -= this.frameBytes(evicted);
        }
    }
}
