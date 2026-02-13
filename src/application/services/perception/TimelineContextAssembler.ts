import { injectable } from 'tsyringe';
import type { SnapshotFrame, TimelineContextWindow } from '@domain/value-objects/TemporalObservation';

@injectable()
export class TimelineContextAssembler {
    assemble(runId: string, frames: readonly SnapshotFrame[], maxFramesPerWindow: number): TimelineContextWindow {
        const bounded = frames.slice(-Math.max(1, maxFramesPerWindow));
        const fromTimestamp = bounded[0]?.timestamp ?? Date.now();
        const toTimestamp = bounded[bounded.length - 1]?.timestamp ?? fromTimestamp;

        return {
            runId,
            fromTimestamp,
            toTimestamp,
            frames: bounded,
            summary: `Timeline window with ${bounded.length} frame(s) from ${fromTimestamp} to ${toTimestamp}`
        };
    }
}
