import { injectable } from 'tsyringe';
import type { SnapshotFrame, TimelineContextWindow } from '@domain/value-objects/TemporalObservation';
import type { TemporalObservationMode } from './TemporalObservationPolicyService';

export interface TemporalPromptAssemblyInput {
    readonly runId: string;
    readonly mode: TemporalObservationMode;
    readonly frames: readonly SnapshotFrame[];
    readonly maxFramesPerWindow: number;
    readonly droppedFrameCount: number;
    readonly redactionApplied: boolean;
    readonly tokenBudget?: number;
}

@injectable()
export class TemporalPromptAssemblerService {
    assemble(input: TemporalPromptAssemblyInput): TimelineContextWindow {
        const boundedFrames = input.frames.slice(-Math.max(1, input.maxFramesPerWindow));
        const budget = this.normalizeBudget(input.tokenBudget);
        const budgetedFrames = this.applyBudget(boundedFrames, budget);
        const fromTimestamp = budgetedFrames[0]?.timestamp ?? Date.now();
        const toTimestamp = budgetedFrames[budgetedFrames.length - 1]?.timestamp ?? fromTimestamp;
        const tokenEstimate = this.estimateTokens(budgetedFrames);

        return {
            runId: input.runId,
            fromTimestamp,
            toTimestamp,
            frames: budgetedFrames,
            summary: `Temporal ${input.mode} window with ${budgetedFrames.length} frame(s), dropped ${input.droppedFrameCount}, estimated ${tokenEstimate} tokens`,
            mode: input.mode,
            selectedFrameCount: budgetedFrames.length,
            droppedFrameCount: input.droppedFrameCount,
            tokenEstimate,
            redactionApplied: input.redactionApplied
        };
    }

    private normalizeBudget(tokenBudget: number | undefined): number {
        if (!Number.isFinite(tokenBudget) || !tokenBudget || tokenBudget <= 0) {
            return 400;
        }
        return Math.max(80, Math.floor(tokenBudget));
    }

    private applyBudget(frames: readonly SnapshotFrame[], tokenBudget: number): SnapshotFrame[] {
        const selected: SnapshotFrame[] = [];
        let used = 0;

        for (let index = frames.length - 1; index >= 0; index--) {
            const frame = frames[index];
            if (!frame) {
                continue;
            }

            const cost = this.estimateFrameTokens(frame);
            if (selected.length > 0 && used + cost > tokenBudget) {
                continue;
            }

            selected.push(frame);
            used += cost;
        }

        return selected.reverse();
    }

    private estimateTokens(frames: readonly SnapshotFrame[]): number {
        return frames.reduce((total, frame) => total + this.estimateFrameTokens(frame), 0);
    }

    private estimateFrameTokens(frame: SnapshotFrame): number {
        const base = 16;
        const domCost = frame.domHash ? Math.ceil(frame.domHash.length / 6) : 0;
        const noteCost = frame.note ? Math.ceil(frame.note.length / 6) : 0;
        return base + domCost + noteCost;
    }
}
