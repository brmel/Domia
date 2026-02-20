import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { RunRecoveryPolicyService } from '@application/services/execution/RunRecoveryPolicyService';

describe('RunRecoveryPolicyService', () => {
    const service = new RunRecoveryPolicyService();

    it('returns non-recover decision in observe mode', () => {
        const decision = service.decide({
            runId: 'r1',
            canResume: true,
            lastStableStepNumber: 10,
            suggestedStartStep: 10,
            reason: 'ok'
        }, 'observe');

        expect(decision.shouldRecover).toBe(false);
    });

    it('returns non-recover when no recovery model is available', () => {
        const decision = service.decide({
            runId: 'r1',
            canResume: false,
            lastStableStepNumber: 0,
            suggestedStartStep: 0,
            reason: 'none'
        }, 'auto-safe');

        expect(decision.shouldRecover).toBe(false);
    });

    it('returns recover decision in auto-safe when resumable', () => {
        const decision = service.decide({
            runId: 'r1',
            canResume: true,
            lastStableStepNumber: 5,
            suggestedStartStep: 5,
            reason: 'checkpoint'
        }, 'auto-safe');

        expect(decision.shouldRecover).toBe(true);
    });

    it('returns recover decision in manual-only when resumable', () => {
        const decision = service.decide({
            runId: 'r1',
            canResume: true,
            lastStableStepNumber: 5,
            suggestedStartStep: 5,
            reason: 'checkpoint'
        }, 'manual-only');

        expect(decision.shouldRecover).toBe(true);
    });
});
