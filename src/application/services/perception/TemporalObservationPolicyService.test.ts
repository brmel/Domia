import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { TemporalObservationPolicyService } from './TemporalObservationPolicyService';

describe('TemporalObservationPolicyService', () => {
    const service = new TemporalObservationPolicyService();

    it('resolves sane defaults', () => {
        const config = service.resolve();
        expect(config.baselineIntervalMs).toBe(1000);
        expect(config.burstIntervalMs).toBe(120);
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
