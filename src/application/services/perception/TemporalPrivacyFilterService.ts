import { injectable } from 'tsyringe';
import type { SnapshotFrame } from '@domain/value-objects/TemporalObservation';

interface TemporalPrivacyInput {
    readonly enabled: boolean;
}

interface TemporalPrivacyResult {
    readonly frames: readonly SnapshotFrame[];
    readonly redactionApplied: boolean;
}

@injectable()
export class TemporalPrivacyFilterService {
    redact(frames: readonly SnapshotFrame[], input: TemporalPrivacyInput): TemporalPrivacyResult {
        if (!input.enabled) {
            return { frames, redactionApplied: false };
        }

        const redacted = frames.map(frame => ({
            timestamp: frame.timestamp,
            intervalMs: frame.intervalMs,
            ...(frame.screenshotPath ? { screenshotPath: frame.screenshotPath } : {}),
            ...(frame.domHash ? { domHash: this.maskHash(frame.domHash) } : {}),
            ...(frame.note ? { note: this.redactNote(frame.note) } : {})
        }));

        const redactionApplied = redacted.some((frame, index) =>
            frame.domHash !== frames[index]?.domHash || frame.note !== frames[index]?.note
        );

        return {
            frames: redacted,
            redactionApplied
        };
    }

    private maskHash(value: string): string {
        if (value.length <= 8) {
            return value;
        }
        return `${value.slice(0, 8)}…`;
    }

    private redactNote(value: string): string {
        return value
            .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
            .replace(/\b\d{6,}\b/g, '[redacted-number]');
    }
}
