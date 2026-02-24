import { describe, expect, it } from 'vitest';
import { appendStepToList, moveItem, normalizeSteps, removeStepById, updateStepById } from '@presentation/components/workflow/WorkflowWorkspace.helpers';

describe('WorkflowWorkspace helpers', () => {
    it('normalizes and filters incomplete steps', () => {
        const normalized = normalizeSteps([
            { id: 'new-step-1', name: '  Step A  ', prompt: '  Do A  ', continueOnFailure: false },
            { id: 'existing-1', name: ' ', prompt: 'Missing name', continueOnFailure: false }
        ]);

        expect(normalized).toEqual([
            { name: 'Step A', prompt: 'Do A', continueOnFailure: false }
        ]);
    });

    it('moves items safely', () => {
        const moved = moveItem(['a', 'b', 'c'], 0, 1);
        expect(moved).toEqual(['b', 'a', 'c']);

        const unchanged = moveItem(['a', 'b', 'c'], 0, -1);
        expect(unchanged).toEqual(['a', 'b', 'c']);
    });

    it('updates and removes steps', () => {
        const steps = [
            { id: 's1', name: 'Step 1', prompt: 'P1', continueOnFailure: false },
            { id: 's2', name: 'Step 2', prompt: 'P2', continueOnFailure: true }
        ];

        const updated = updateStepById(steps, 's1', { prompt: 'P1 updated' });
        expect(updated[0]?.prompt).toBe('P1 updated');

        const removed = removeStepById(updated, 's2');
        expect(removed).toHaveLength(1);
        expect(removed[0]?.id).toBe('s1');
    });

    it('appends a new editable step', () => {
        const steps = [{ id: 's1', name: 'Step 1', prompt: 'P1', continueOnFailure: false }];
        const appended = appendStepToList(steps);

        expect(appended).toHaveLength(2);
        expect(appended[1]?.name).toBe('Step 2');
    });
});
