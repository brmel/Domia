import type { IPerceptionSource } from '@domain/ports/IPerceptionSource';

/**
 * A single frame in an action recording.
 */
export interface RecordingFrame {
    /** Milliseconds since recording started */
    readonly offsetMs: number;
    /** JPEG screenshot buffer */
    readonly screenshot: Buffer;
}

/**
 * Complete recording of an action execution.
 */
export interface ActionRecording {
    /** Tool name that was being executed */
    readonly toolName: string;
    /** When the recording started (ISO string) */
    readonly startedAt: string;
    /** Total duration of the recording in ms */
    readonly durationMs: number;
    /** Captured frames */
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
    maxDurationMs: 100,
    intervalMs: 25,
    quality: 40,
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

        // Start concurrent frame capture loop
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

                // Wait for next capture interval
                if (capturing) {
                    await new Promise<void>((resolve) =>
                        setTimeout(resolve, opts.intervalMs)
                    );
                }
            }
        })();

        // Execute the actual action concurrently
        let result: T;
        try {
            result = await action();
        } finally {
            // Stop capture loop once action completes
            capturing = false;
        }

        // Wait for any in-flight capture to finish
        await captureLoop;

        // Capture one final frame after the action completes (shows end-state)
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
