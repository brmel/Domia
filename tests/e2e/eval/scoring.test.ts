import { describe, it, expect } from 'vitest';
import { scoreExact, scoreNumeric, scoreSemantic, rougeLF1 } from '../../eval/scoring';

describe('Eval harness scoring (W17)', () => {
    it('exact match is strict', () => {
        expect(scoreExact('Submitted', 'Submitted').pass).toBe(true);
        expect(scoreExact('Submitted', 'submitted').pass).toBe(false);
    });

    it('numeric match honors epsilon', () => {
        expect(scoreNumeric(42, 42).pass).toBe(true);
        expect(scoreNumeric(1.0, 1.0000001, 1e-3).pass).toBe(true);
        expect(scoreNumeric(1, 2).pass).toBe(false);
    });

    it('semantic ROUGE-L rewards overlap and passes above threshold', () => {
        expect(rougeLF1('the order was placed successfully', 'the order was placed successfully')).toBe(1);
        expect(scoreSemantic('the order was placed successfully', 'order placed successfully').pass).toBe(true);
        expect(scoreSemantic('the order was placed', 'completely unrelated banana text here').pass).toBe(false);
    });

    it('empty strings score consistently', () => {
        expect(rougeLF1('', '')).toBe(1);
        expect(rougeLF1('something', '')).toBe(0);
    });
});
