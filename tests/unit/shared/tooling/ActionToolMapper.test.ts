import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ActionToolMapper } from '@shared/tooling/ActionToolMapper';
import { ActionType } from '@domain/enums/ActionType';

describe('ActionToolMapper evaluator robustness', () => {
    it('accepts evaluator tool calls with empty evidence arrays at schema boundary', () => {
        const mapper = new ActionToolMapper();
        const definitions = mapper.getEvaluationToolDefinitions();
        const retryTool = definitions.find((tool) => tool.name === 'need_retry');
        const retrySchema = retryTool?.schema as { safeParse: (value: unknown) => { success: boolean } } | undefined;

        expect(retryTool).toBeDefined();

        const parsed = retrySchema?.safeParse({
            summary: 'Need another attempt',
            advice: 'Try extracting visible labels',
            confidence: 0.6,
            evidence: []
        });

        expect(parsed?.success).toBe(true);
    });

    it('normalizes empty evaluator evidence into non-empty fallback evidence', () => {
        const mapper = new ActionToolMapper();

        const decision = mapper.mapModelToolCallToEvaluationDecision('need_retry', {
            summary: 'Language buttons are partially visible',
            advice: 'Extract labels before deciding',
            confidence: 0.62,
            evidence: []
        });

        expect(decision.evidence).toEqual(['Evaluator summary: Language buttons are partially visible']);
    });

    it('normalizes missing evaluator evidence into non-empty fallback evidence', () => {
        const mapper = new ActionToolMapper();

        const decision = mapper.mapModelToolCallToEvaluationDecision('sub_task_success', {
            summary: 'Verified EN, AR, and FR language options are present',
            confidence: 0.91
        });

        expect(decision.evidence).toEqual(['Evaluator summary: Verified EN, AR, and FR language options are present']);
    });

    it('rejects action tool calls with negative elementId values', () => {
        const mapper = new ActionToolMapper();

        expect(() => mapper.mapModelToolCallToAction(ActionType.EXTRACT, { elementId: -1 })).toThrow('elementId');
    });
});
