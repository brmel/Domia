import { inject, injectable } from 'tsyringe';
import type { IBrowserAutomation, ILogger, IPerceptionPipeline } from '@domain/ports';
import type { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import type { SnapshotFrame, TimelineContextWindow } from '@domain/value-objects/TemporalObservation';
import type { TemporalObservationMode } from '../perception/TemporalObservationPolicyService';
import { TemporalObservationPolicyService } from '../perception/TemporalObservationPolicyService';
import { TimelineContextAssembler } from '../perception/TimelineContextAssembler';
import { TemporalContextSelectorService } from '../perception/TemporalContextSelectorService';
import { TemporalPrivacyFilterService } from '../perception/TemporalPrivacyFilterService';
import { TemporalPromptAssemblerService } from '../perception/TemporalPromptAssemblerService';

export interface TemporalCaptureOptions {
    readonly vision: boolean;
    readonly debugScreenshots: boolean;
    readonly temporalObservation?: boolean;
    readonly temporalMode?: TemporalObservationMode;
    readonly temporalBurstFrames?: number;
    readonly temporalBaselineIntervalMs?: number;
    readonly temporalBurstIntervalMs?: number;
    readonly temporalMaxFramesPerWindow?: number;
    readonly temporalPromptTokenBudget?: number;
    readonly temporalRedactSensitive?: boolean;
}

export interface TemporalCaptureSignal {
    readonly domVelocity: number;
    readonly interactionInFlight: boolean;
    readonly recentAssertionMismatch: boolean;
    readonly recentExecutionError?: boolean;
    readonly stagnantCycles?: number;
}

const TEMPORAL_STABLE_FRAME_STREAK = 2;

@injectable()
export class TemporalWindowCaptureService {
    constructor(
        @inject(TemporalObservationPolicyService) private readonly temporalPolicy: TemporalObservationPolicyService,
        @inject('IPerceptionPipeline') private readonly perception: IPerceptionPipeline,
        @inject(TimelineContextAssembler) private readonly timelineAssembler: TimelineContextAssembler,
        @inject(TemporalContextSelectorService) private readonly temporalSelector: TemporalContextSelectorService,
        @inject(TemporalPrivacyFilterService) private readonly temporalPrivacyFilter: TemporalPrivacyFilterService,
        @inject(TemporalPromptAssemblerService) private readonly temporalPromptAssembler: TemporalPromptAssemblerService,
        @inject('ILogger') private readonly logger: ILogger,
    ) { }

    async capture(
        runId: string,
        browser: IBrowserAutomation,
        baseFrame: PerceptionFrame,
        options: TemporalCaptureOptions,
        signal: TemporalCaptureSignal
    ): Promise<TimelineContextWindow | undefined> {
        const capturePlan = this.temporalPolicy.planCapture({
            featureEnabled: true,
            requested: Boolean(options.temporalObservation),
            ...(options.temporalMode ? { mode: options.temporalMode } : {}),
            signal,
            overrides: {
                ...(options.temporalBaselineIntervalMs ? { baselineIntervalMs: options.temporalBaselineIntervalMs } : {}),
                ...(options.temporalBurstIntervalMs ? { burstIntervalMs: options.temporalBurstIntervalMs } : {}),
                ...(options.temporalBurstFrames ? { burstMaxFrames: options.temporalBurstFrames } : {}),
                ...(options.temporalMaxFramesPerWindow ? { maxFramesPerWindow: options.temporalMaxFramesPerWindow } : {})
            }
        });

        if (!capturePlan.enabled) {
            return undefined;
        }

        const timelineFrames: SnapshotFrame[] = [this.toSnapshotFrame(baseFrame, options.temporalBaselineIntervalMs ?? 1000)];
        let previousTimestamp = baseFrame.timestamp;
        let previousDomHash = timelineFrames[0]?.domHash;
        let stableFrameStreak = 0;

        for (let index = 1; index < capturePlan.maxFrames; index++) {
            await new Promise(resolve => setTimeout(resolve, capturePlan.burstIntervalMs));

            const frameResult = await this.perception.capture(browser, {
                vision: options.vision || options.debugScreenshots,
                aria: true,
                dom: true
            });

            if (frameResult.isErr()) {
                this.logger.debug(`[TemporalWindowCaptureService] Temporal capture stopped at frame ${index}: ${frameResult.error.message}`);
                break;
            }

            const frame = frameResult.value;
            const interval = Math.max(1, frame.timestamp - previousTimestamp);
            previousTimestamp = frame.timestamp;

            const snapshotFrame = this.toSnapshotFrame(frame, interval);
            timelineFrames.push(snapshotFrame);

            if (snapshotFrame.domHash === previousDomHash) {
                stableFrameStreak += 1;
                if (stableFrameStreak >= TEMPORAL_STABLE_FRAME_STREAK) {
                    this.logger.debug(`[TemporalWindowCaptureService] Temporal capture early-stop after ${index + 1} frames due to stable DOM signature`);
                    break;
                }
            } else {
                stableFrameStreak = 0;
            }

            previousDomHash = snapshotFrame.domHash;
        }

        const assembled = this.timelineAssembler.assemble(runId, timelineFrames, capturePlan.maxFramesPerWindow);
        const selected = this.temporalSelector.select(assembled.frames, { maxFrames: capturePlan.maxFramesPerWindow });
        const redacted = this.temporalPrivacyFilter.redact(selected.frames, { enabled: options.temporalRedactSensitive ?? true });

        return this.temporalPromptAssembler.assemble({
            runId,
            mode: capturePlan.mode,
            frames: redacted.frames,
            maxFramesPerWindow: capturePlan.maxFramesPerWindow,
            droppedFrameCount: selected.droppedFrameCount,
            redactionApplied: redacted.redactionApplied,
            ...(options.temporalPromptTokenBudget !== undefined ? { tokenBudget: options.temporalPromptTokenBudget } : {})
        });
    }

    private toSnapshotFrame(frame: PerceptionFrame, intervalMs: number): SnapshotFrame {
        const domHash = `${frame.metadata.url}|${frame.metadata.title}|${frame.semantic.dom?.elements?.length ?? 0}`;

        return {
            timestamp: frame.timestamp,
            intervalMs,
            domHash,
            note: 'perception-capture'
        };
    }
}
