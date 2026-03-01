import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { RecoveryEligibilityService } from '@application/services/execution/RecoveryEligibilityService';

describe('RecoveryEligibilityService', () => {
    const service = new RecoveryEligibilityService();

    it('builds a non-resumable read model when no checkpoints exist', () => {
        const model = service.buildReadModel('r1', []);
        expect(model.canResume).toBe(false);
        expect(model.reason).toBe('No checkpoints available');
    });

    it('builds a resumable read model from the latest checkpoint', () => {
        const checkpoints = [{
            runId: 'r1',
            checkpointId: 'cp-1',
            parentCheckpointId: null,
            branchId: 'main',
            sequenceNumber: 1,
            commitBoundary: true,
            sideEffectSetHash: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            reason: 'action_applied' as const,
            state: { status: 'acting' as const, stepNumber: 5, variables: {}, history: [] }
        }];
        const model = service.buildReadModel('r1', checkpoints);
        expect(model.canResume).toBe(true);
        expect(model.lastStableStepNumber).toBe(5);
    });

    it('returns non-recover decision in observe mode', () => {
        const decision = service.evaluatePolicy({
            runId: 'r1',
            canResume: true,
            lastStableStepNumber: 10,
            suggestedStartStep: 10,
            reason: 'ok'
        }, 'observe');

        expect(decision.shouldRecover).toBe(false);
    });

    it('returns non-recover when no recovery model is available', () => {
        const decision = service.evaluatePolicy({
            runId: 'r1',
            canResume: false,
            lastStableStepNumber: 0,
            suggestedStartStep: 0,
            reason: 'none'
        }, 'auto-safe');

        expect(decision.shouldRecover).toBe(false);
    });

    it('returns recover decision in auto-safe when resumable', () => {
        const decision = service.evaluatePolicy({
            runId: 'r1',
            canResume: true,
            lastStableStepNumber: 5,
            suggestedStartStep: 5,
            reason: 'checkpoint'
        }, 'auto-safe');

        expect(decision.shouldRecover).toBe(true);
    });

    it('returns recover decision in manual-only when resumable', () => {
        const decision = service.evaluatePolicy({
            runId: 'r1',
            canResume: true,
            lastStableStepNumber: 5,
            suggestedStartStep: 5,
            reason: 'checkpoint'
        }, 'manual-only');

        expect(decision.shouldRecover).toBe(true);
    });
});
