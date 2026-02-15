import { injectable } from 'tsyringe';
import type { TemporalObservationConfig } from '@domain/value-objects/TemporalObservation';

export type TemporalObservationMode = 'off' | 'baseline' | 'adaptive' | 'forensic';

interface ModeConfigDefaults {
    readonly baselineIntervalMs: number;
    readonly burstIntervalMs: number;
    readonly burstMaxFrames: number;
    readonly maxFramesPerWindow: number;
}

const MODE_DEFAULTS: Record<Exclude<TemporalObservationMode, 'off'>, ModeConfigDefaults> = {
    baseline: {
        baselineIntervalMs: 1500,
        burstIntervalMs: 300,
        burstMaxFrames: 3,
        maxFramesPerWindow: 6
    },
    adaptive: {
        baselineIntervalMs: 1000,
        burstIntervalMs: 120,
        burstMaxFrames: 20,
        maxFramesPerWindow: 12
    },
    forensic: {
        baselineIntervalMs: 500,
        burstIntervalMs: 80,
        burstMaxFrames: 30,
        maxFramesPerWindow: 20
    }
};

const DEFAULT_CONFIG: TemporalObservationConfig = {
    baselineIntervalMs: 1000,
    burstIntervalMs: 120,
    burstMaxFrames: 20,
    maxFramesPerWindow: 12
};

export interface TemporalObservationOverrides {
    readonly baselineIntervalMs?: number;
    readonly burstIntervalMs?: number;
    readonly burstMaxFrames?: number;
    readonly maxFramesPerWindow?: number;
}

export interface TemporalCapturePlan {
    readonly mode: TemporalObservationMode;
    readonly enabled: boolean;
    readonly maxFrames: number;
    readonly burstIntervalMs: number;
    readonly maxFramesPerWindow: number;
}

interface TemporalSignal {
    readonly domVelocity: number;
    readonly interactionInFlight: boolean;
    readonly recentAssertionMismatch: boolean;
    readonly recentExecutionError?: boolean;
    readonly stagnantCycles?: number;
}

const CAPTURE_LIMITS = {
    maxBurstFrames: 36,
    maxFramesPerWindow: 24,
    minBurstIntervalMs: 40
} as const;

@injectable()
export class TemporalObservationPolicyService {
    resolve(mode: TemporalObservationMode = 'adaptive', overrides?: TemporalObservationOverrides): TemporalObservationConfig {
        if (mode === 'off') {
            return {
                baselineIntervalMs: DEFAULT_CONFIG.baselineIntervalMs,
                burstIntervalMs: DEFAULT_CONFIG.burstIntervalMs,
                burstMaxFrames: 1,
                maxFramesPerWindow: 1
            };
        }

        const defaults = MODE_DEFAULTS[mode];

        return {
            baselineIntervalMs: this.sanitize(overrides?.baselineIntervalMs, defaults.baselineIntervalMs),
            burstIntervalMs: this.sanitize(overrides?.burstIntervalMs, defaults.burstIntervalMs),
            burstMaxFrames: this.sanitize(overrides?.burstMaxFrames, defaults.burstMaxFrames),
            maxFramesPerWindow: this.sanitize(overrides?.maxFramesPerWindow, defaults.maxFramesPerWindow)
        };
    }

    planCapture(input: {
        featureEnabled: boolean;
        requested: boolean;
        mode?: TemporalObservationMode;
        signal: TemporalSignal;
        overrides?: TemporalObservationOverrides;
    }): TemporalCapturePlan {
        const mode = input.mode ?? 'adaptive';

        if (!input.featureEnabled || !input.requested || mode === 'off') {
            return {
                mode,
                enabled: false,
                maxFrames: 0,
                burstIntervalMs: DEFAULT_CONFIG.burstIntervalMs,
                maxFramesPerWindow: DEFAULT_CONFIG.maxFramesPerWindow
            };
        }

        const policy = this.resolve(mode, input.overrides);
        const burstAllowed = mode === 'forensic' || mode === 'adaptive' || mode === 'baseline';
        const shouldBurst = mode === 'forensic' || (burstAllowed && this.shouldEnterBurstMode(input.signal));

        const boundedBurstIntervalMs = Math.max(CAPTURE_LIMITS.minBurstIntervalMs, policy.burstIntervalMs);
        const boundedWindowFrames = Math.min(policy.maxFramesPerWindow, CAPTURE_LIMITS.maxFramesPerWindow);
        const boundedBurstFrames = Math.min(policy.burstMaxFrames, CAPTURE_LIMITS.maxBurstFrames);

        const resolvedMaxFrames = shouldBurst
            ? this.resolveAdaptiveFrameBudget(mode, boundedBurstFrames, input.signal)
            : 1;

        return {
            mode,
            enabled: true,
            maxFrames: resolvedMaxFrames,
            burstIntervalMs: boundedBurstIntervalMs,
            maxFramesPerWindow: boundedWindowFrames
        };
    }

    shouldEnterBurstMode(signal: TemporalSignal): boolean {
        const stagnantPressure = (signal.stagnantCycles ?? 0) >= 2 && signal.domVelocity >= 0.35;
        return signal.interactionInFlight
            || signal.recentAssertionMismatch
            || Boolean(signal.recentExecutionError)
            || signal.domVelocity >= 0.7
            || stagnantPressure;
    }

    private resolveAdaptiveFrameBudget(mode: TemporalObservationMode, burstMaxFrames: number, signal: TemporalSignal): number {
        if (mode === 'forensic') {
            return burstMaxFrames;
        }

        if (mode === 'baseline') {
            return Math.max(2, Math.min(4, burstMaxFrames));
        }

        const highVolatility = signal.domVelocity >= 0.7 || signal.interactionInFlight || Boolean(signal.recentExecutionError);
        if (highVolatility) {
            return burstMaxFrames;
        }

        if (signal.recentAssertionMismatch || signal.domVelocity >= 0.45 || (signal.stagnantCycles ?? 0) >= 2) {
            return Math.max(3, Math.floor(burstMaxFrames / 2));
        }

        return Math.max(2, Math.floor(burstMaxFrames / 3));
    }

    private sanitize(value: number | undefined, defaultValue: number): number {
        if (!Number.isFinite(value) || !value || value <= 0) {
            return defaultValue;
        }
        return Math.floor(value);
    }
}
