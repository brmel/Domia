import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { TemporalObservationPolicyService } from './TemporalObservationPolicyService';

describe('TemporalObservationPolicyService', () => {
    const service = new TemporalObservationPolicyService();

    it('resolves sane defaults for adaptive mode', () => {
        const config = service.resolve('adaptive');
        expect(config.baselineIntervalMs).toBe(1000);
        expect(config.burstIntervalMs).toBe(120);
    });

    it('returns disabled capture plan when mode is off', () => {
        const plan = service.planCapture({
            featureEnabled: true,
            requested: true,
            mode: 'off',
            signal: {
                domVelocity: 1,
                interactionInFlight: true,
                recentAssertionMismatch: true
            }
        });

        expect(plan.enabled).toBe(false);
        expect(plan.maxFrames).toBe(0);
    });

    it('enters full burst in forensic mode', () => {
        const plan = service.planCapture({
            featureEnabled: true,
            requested: true,
            mode: 'forensic',
            signal: {
                domVelocity: 0.1,
                interactionInFlight: false,
                recentAssertionMismatch: false
            }
        });

        expect(plan.enabled).toBe(true);
        expect(plan.maxFrames).toBe(30);
    });

    it('enters burst mode on interaction signal', () => {
        const shouldBurst = service.shouldEnterBurstMode({
            domVelocity: 0.1,
            interactionInFlight: true,
            recentAssertionMismatch: false
        });

        expect(shouldBurst).toBe(true);
    });

    it('stays baseline with low-risk signals', () => {
        const shouldBurst = service.shouldEnterBurstMode({
            domVelocity: 0.2,
            interactionInFlight: false,
            recentAssertionMismatch: false
        });

        expect(shouldBurst).toBe(false);
    });
});
