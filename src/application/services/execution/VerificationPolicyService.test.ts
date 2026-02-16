import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ActionType } from '@domain/enums/ActionType';
import { ElementIdFactory } from '@domain/value-objects';
import { VerificationPolicyService } from './VerificationPolicyService';

describe('VerificationPolicyService', () => {
    it('accepts high-confidence success unchanged', () => {
        const service = new VerificationPolicyService();

        const decision = service.enforce(
            {
                decision: 'sub_task_success',
                summary: 'confirmed',
                confidence: 0.92,
                evidence: ['Confirmation element visible']
            },
            {
                attemptedAction: { type: ActionType.CLICK, elementId: ElementIdFactory.unsafe(1), thought: 'click' },
                executionOutcome: 'executed',
                stepsRemaining: 3
            }
        );

        expect(decision.adjusted).toBe(false);
        expect(decision.evaluation.decision).toBe('sub_task_success');
    });

    it('downgrades low-confidence success to retry', () => {
        const service = new VerificationPolicyService();

        const decision = service.enforce(
            {
                decision: 'sub_task_success',
                summary: 'maybe done',
                confidence: 0.42,
                evidence: ['No strong confirmation found']
            },
            {
                attemptedAction: { type: ActionType.WAIT, durationMs: 200, thought: 'wait' },
                executionOutcome: 'not_executed',
                stepsRemaining: 4
            }
        );

        expect(decision.adjusted).toBe(true);
        expect(decision.evaluation.decision).toBe('need_retry');
        expect(decision.evaluation.advice).toContain('additional visible confirmation');
    });

    it('rejects evaluation missing evidence', () => {
        const service = new VerificationPolicyService();

        expect(() =>
            service.enforce(
                {
                    decision: 'need_retry',
                    summary: 'retry',
                    advice: 'try again',
                    confidence: 0.8,
                    evidence: []
                },
                {
                    attemptedAction: { type: ActionType.SCROLL, direction: 'down', thought: 'scroll' },
                    executionOutcome: 'executed',
                    stepsRemaining: 2
                }
            )
        ).toThrow('Evaluation evidence must contain at least one item');
    });
});
