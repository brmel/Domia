import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ActionType } from '@domain/enums/ActionType';
import { ElementIdFactory } from '@domain/value-objects';
import { VerificationPolicyService } from '@application/services/execution/VerificationPolicyService';

describe('VerificationPolicyService', () => {
    it('accepts high-confidence explicit pass success unchanged', () => {
        const service = new VerificationPolicyService();

        const decision = service.enforce(
            {
                decision: 'sub_task_success',
                summary: 'confirmed',
                confidence: 0.92,
                evidence: ['Confirmation element visible', 'Secondary confirmation present']
            },
            {
                attemptedAction: { type: ActionType.PASS, summary: 'done', thought: 'pass' },
                executionOutcome: 'not_executed',
                stepsRemaining: 3,
                priorActionCount: 2
            }
        );

        expect(decision.adjusted).toBe(false);
        expect(decision.evaluation.decision).toBe('sub_task_success');
    });

    it('accepts high-confidence non-pass success without forcing explicit pass action', () => {
        const service = new VerificationPolicyService();

        const decision = service.enforce(
            {
                decision: 'sub_task_success',
                summary: 'Looks complete after click',
                confidence: 0.95,
                evidence: ['Clicked target control', 'No obvious errors shown']
            },
            {
                attemptedAction: { type: ActionType.CLICK, elementId: ElementIdFactory.unsafe(1), thought: 'click' },
                executionOutcome: 'executed',
                stepsRemaining: 3,
                priorActionCount: 2
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
                attemptedAction: { type: ActionType.PASS, summary: 'done', thought: 'pass' },
                executionOutcome: 'not_executed',
                stepsRemaining: 4,
                priorActionCount: 2
            }
        );

        expect(decision.adjusted).toBe(true);
        expect(decision.evaluation.decision).toBe('need_retry');
        expect(decision.evaluation.advice).toContain('Collect and report at least two concrete evidence points');
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

    it('downgrades terminal pass success when attempted as first in-step action', () => {
        const service = new VerificationPolicyService();

        const decision = service.enforce(
            {
                decision: 'sub_task_success',
                summary: 'done',
                confidence: 0.95,
                evidence: ['Target appears visible', 'Language switcher appears set']
            },
            {
                attemptedAction: { type: ActionType.PASS, summary: 'done', thought: 'pass' },
                executionOutcome: 'not_executed',
                stepsRemaining: 4,
                priorActionCount: 0
            }
        );

        expect(decision.adjusted).toBe(true);
        expect(decision.evaluation.decision).toBe('need_retry');
        expect(decision.reason).toContain('first in-step action');
    });

    it('downgrades terminal pass success when evidence count is below policy minimum', () => {
        const service = new VerificationPolicyService();

        const decision = service.enforce(
            {
                decision: 'sub_task_success',
                summary: 'done',
                confidence: 0.95,
                evidence: ['Only one weak signal']
            },
            {
                attemptedAction: { type: ActionType.PASS, summary: 'done', thought: 'pass' },
                executionOutcome: 'not_executed',
                stepsRemaining: 2,
                priorActionCount: 2
            }
        );

        expect(decision.adjusted).toBe(true);
        expect(decision.evaluation.decision).toBe('need_retry');
        expect(decision.reason).toContain('insufficient evidence');
    });

    it('accepts terminal pass when custom profile relaxes thresholds', () => {
        const service = new VerificationPolicyService();

        const decision = service.enforce(
            {
                decision: 'sub_task_success',
                summary: 'done',
                confidence: 0.82,
                evidence: ['Signal observed']
            },
            {
                attemptedAction: { type: ActionType.PASS, summary: 'done', thought: 'pass' },
                executionOutcome: 'not_executed',
                stepsRemaining: 2,
                priorActionCount: 3
            },
            {
                terminalPassMinConfidence: 0.7,
                terminalPassMinEvidenceItems: 1
            }
        );

        expect(decision.adjusted).toBe(false);
        expect(decision.evaluation.decision).toBe('sub_task_success');
    });

    it('blocks supervised pass when no prior verification action exists', () => {
        const service = new VerificationPolicyService();

        const decision = service.evaluatePassEligibility(
            { type: ActionType.PASS, summary: 'done', thought: 'pass' },
            []
        );

        expect(decision.allowed).toBe(false);
        expect(decision.reason).toContain('prior verification action');
    });

    it('allows supervised pass after a prior non-terminal verification action', () => {
        const service = new VerificationPolicyService();

        const decision = service.evaluatePassEligibility(
            { type: ActionType.PASS, summary: 'done', thought: 'pass' },
            [{ type: ActionType.EXTRACT, elementId: ElementIdFactory.unsafe(1), thought: 'extract' }]
        );

        expect(decision.allowed).toBe(true);
    });

});
