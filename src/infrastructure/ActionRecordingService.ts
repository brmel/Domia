import type { IPerceptionSource } from '@domain/ports/IPerceptionSource';
import {
    DEFAULT_RECORDING_MAX_DURATION_MS,
    DEFAULT_RECORDING_INTERVAL_MS,
    DEFAULT_RECORDING_QUALITY,
} from '@shared/defaults';

interface RecordingFrame {
    readonly offsetMs: number;
    readonly screenshot: Buffer;
}

interface ActionRecording {
    readonly toolName: string;
    readonly startedAt: string;
    readonly durationMs: number;
    readonly frames: readonly RecordingFrame[];
}

export interface ActionRecordingOptions {
    /**
     * Maximum duration of recording in milliseconds.
     * For very fast actions this caps how long we record.
     * Default: 100ms.
     */
    maxDurationMs?: number;

    /**
     * Interval between frame captures in milliseconds.
     * Lower = more frames = more detail but higher overhead.
     * Default: 25ms (≈40 fps).
     */
    intervalMs?: number;

    /**
     * JPEG quality for screenshots (1-100).
     * Default: 40 (low quality for speed).
     */
    quality?: number;
}

const DEFAULT_OPTIONS: Required<ActionRecordingOptions> = {
    maxDurationMs: DEFAULT_RECORDING_MAX_DURATION_MS,
    intervalMs: DEFAULT_RECORDING_INTERVAL_MS,
    quality: DEFAULT_RECORDING_QUALITY,
};

/**
 * Records rapid-interval screenshots during action execution.
 *
 * Usage:
 * ```
 * const recorder = new ActionRecordingService(perceptionSource);
 * const recording = await recorder.record('click', async () => {
 *     await automation.click(ref);
 * });
 * // recording.frames contains the captured screenshots
 * ```
 *
 * This is designed for capturing fast UI transitions that would otherwise be
 * missed between an action and the next observe call. The recording runs
 * concurrently with the action execution.
 */
export class ActionRecordingService {
    constructor(
        private readonly source: IPerceptionSource,
    ) {}

    /**
     * Record rapid-interval screenshots while executing an action.
     *
     * @param toolName - Name of the tool being executed (for metadata)
     * @param action - The async action to execute
     * @param options - Recording configuration
     * @returns The action result paired with the recording
     */
    async record<T>(
        toolName: string,
        action: () => Promise<T>,
        options?: ActionRecordingOptions,
    ): Promise<{ result: T; recording: ActionRecording }> {
        const opts = { ...DEFAULT_OPTIONS, ...options };
        const frames: RecordingFrame[] = [];
        const startedAt = new Date().toISOString();
        const startMs = Date.now();

        let capturing = true;

        const captureLoop = (async () => {
            while (capturing && (Date.now() - startMs) < opts.maxDurationMs) {
                const offsetMs = Date.now() - startMs;
                try {
                    const screenshot = await this.source.captureScreenshot({
                        type: 'jpeg',
                        quality: opts.quality,
                    });
                    frames.push({ offsetMs, screenshot });
                } catch {
                    // Screenshot failures are non-fatal — skip frame
                }

                if (capturing) {
                    await new Promise<void>((resolve) =>
                        setTimeout(resolve, opts.intervalMs)
                    );
                }
            }
        })();

        let result: T;
        try {
            result = await action();
        } finally {
            capturing = false;
        }

        await captureLoop;

        try {
            const screenshot = await this.source.captureScreenshot({
                type: 'jpeg',
                quality: opts.quality,
            });
            frames.push({ offsetMs: Date.now() - startMs, screenshot });
        } catch {
            // Non-fatal
        }

        const recording: ActionRecording = {
            toolName,
            startedAt,
            durationMs: Date.now() - startMs,
            frames,
        };

        return { result, recording };
    }
}
