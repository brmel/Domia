import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ActionType } from '@domain/enums/ActionType';
import { EvidenceBlackboardService } from './EvidenceBlackboardService';

describe('EvidenceBlackboardService', () => {
    it('composes advice from evaluator guidance and recent facts', () => {
        const service = new EvidenceBlackboardService();

        service.recordAction('run-1', { type: ActionType.WAIT, durationMs: 50, thought: 'wait' }, 'executed');
        service.recordEvaluation('run-1', {
            decision: 'need_retry',
            summary: 'Need stronger confirmation',
            confidence: 0.71,
            advice: 'Extract text from the confirmation badge',
            evidence: ['Badge appears visible']
        });

        const advice = service.composeAdvice('run-1', 'Retry with explicit verification');

        expect(advice).toContain('Retry with explicit verification');
        expect(advice).toContain('Recent evidence');
        expect(advice).toContain('need_retry');
    });

    it('clears run-scoped memory', () => {
        const service = new EvidenceBlackboardService();

        service.recordAction('run-2', { type: ActionType.WAIT, durationMs: 100, thought: 'wait' }, 'executed');
        expect(service.composeAdvice('run-2')).toContain('Recent evidence');

        service.clearRun('run-2');
        expect(service.composeAdvice('run-2')).toBeUndefined();
    });

    it('records direct observation entries and ignores blank values', () => {
        const service = new EvidenceBlackboardService();

        service.recordObservation('run-3', '   Extracted text: user is logged in   ');
        service.recordObservation('run-3', '   ');

        const advice = service.composeAdvice('run-3');

        expect(advice).toContain('Observation: Extracted text: user is logged in');
        expect(advice).not.toContain('Observation:    ');
    });
});
