import { injectable } from 'tsyringe';
import type { TemporalObservationConfig } from '@domain/value-objects/TemporalObservation';

const DEFAULT_CONFIG: TemporalObservationConfig = {
    baselineIntervalMs: 1000,
    burstIntervalMs: 120,
    burstMaxFrames: 20,
    maxFramesPerWindow: 12
};

@injectable()
export class TemporalObservationPolicyService {
    resolve(overrides?: Partial<TemporalObservationConfig>): TemporalObservationConfig {
        return {
            baselineIntervalMs: this.sanitize(overrides?.baselineIntervalMs, DEFAULT_CONFIG.baselineIntervalMs),
            burstIntervalMs: this.sanitize(overrides?.burstIntervalMs, DEFAULT_CONFIG.burstIntervalMs),
            burstMaxFrames: this.sanitize(overrides?.burstMaxFrames, DEFAULT_CONFIG.burstMaxFrames),
            maxFramesPerWindow: this.sanitize(overrides?.maxFramesPerWindow, DEFAULT_CONFIG.maxFramesPerWindow)
        };
    }

    shouldEnterBurstMode(signal: { domVelocity: number; interactionInFlight: boolean; recentAssertionMismatch: boolean }): boolean {
        return signal.interactionInFlight || signal.recentAssertionMismatch || signal.domVelocity >= 0.7;
    }

    private sanitize(value: number | undefined, fallback: number): number {
        if (!Number.isFinite(value) || !value || value <= 0) {
            return fallback;
        }
        return Math.floor(value);
    }
}
