import type { IPerceptionSource } from '@domain/ports/IPerceptionSource';
import {
    DEFAULT_RECORDING_MAX_DURATION_MS,
    DEFAULT_RECORDING_INTERVAL_MS,
    DEFAULT_RECORDING_QUALITY,
} from '@shared/defaults';
import { sleep } from '@shared/reliability/sleep';

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
    
    maxDurationMs?: number;

    
    intervalMs?: number;

    
    quality?: number;
}

const DEFAULT_OPTIONS: Required<ActionRecordingOptions> = {
    maxDurationMs: DEFAULT_RECORDING_MAX_DURATION_MS,
    intervalMs: DEFAULT_RECORDING_INTERVAL_MS,
    quality: DEFAULT_RECORDING_QUALITY,
};

export class ActionRecordingService {
    constructor(
        private readonly source: IPerceptionSource,
    ) {}

    
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
                }

                if (capturing) await sleep(opts.intervalMs);
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
