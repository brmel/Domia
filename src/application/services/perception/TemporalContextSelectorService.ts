import { injectable } from 'tsyringe';
import type { SnapshotFrame, TemporalSelectionResult } from '@domain/value-objects/TemporalObservation';

interface TemporalSelectionInput {
    readonly maxFrames: number;
}

@injectable()
export class TemporalContextSelectorService {
    select(frames: readonly SnapshotFrame[], input: TemporalSelectionInput): TemporalSelectionResult {
        const maxFrames = Math.max(1, Math.floor(input.maxFrames));
        if (frames.length <= maxFrames) {
            return {
                frames: [...frames],
                droppedFrameCount: 0
            };
        }

        const scored = frames.map((frame, index) => ({
            frame,
            index,
            score: this.scoreFrame(frame, index, frames.length)
        }));

        const mustKeepIndex = frames.length - 1;
        const top = scored
            .filter(item => item.index !== mustKeepIndex)
            .sort((left, right) => right.score - left.score)
            .slice(0, maxFrames - 1)
            .map(item => item.frame);

        const selected = [...top, frames[mustKeepIndex]!]
            .sort((left, right) => left.timestamp - right.timestamp);

        return {
            frames: selected,
            droppedFrameCount: frames.length - selected.length
        };
    }

    private scoreFrame(frame: SnapshotFrame, index: number, total: number): number {
        const recencyWeight = total > 1 ? index / (total - 1) : 1;
        const domSignal = frame.domHash ? Math.min(1, frame.domHash.length / 32) : 0;
        const intervalSignal = Math.min(1, frame.intervalMs / 1000);

        return recencyWeight * 0.5 + domSignal * 0.3 + intervalSignal * 0.2;
    }
}
