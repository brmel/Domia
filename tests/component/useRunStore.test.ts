import { describe, it, expect, beforeEach } from 'vitest';
import { useRunStore } from '@presentation/stores/useRunStore';
import { RunState } from '@domain/enums';
import type { RunOutput } from '@application/dtos';
import type { RunId } from '@domain/value-objects';

const RUN_1 = 'run-1' as unknown as RunId;

function act(fn: () => void): void {
    fn();
}

describe('useRunStore', () => {
    beforeEach(() => {
        act(() => useRunStore.getState().reset());
    });

    it('starts in idle state', () => {
        const s = useRunStore.getState();
        expect(s.status).toBe(RunState.IDLE);
        expect(s.runId).toBeNull();
        expect(s.history).toEqual([]);
    });

    it('handles started event', () => {
        const event: RunOutput = { type: 'started', runId: RUN_1 };
        act(() => useRunStore.getState().handleRunOutput(event));

        const s = useRunStore.getState();
        expect(s.status).toBe(RunState.RUNNING);
        expect(s.runId).toBe(RUN_1);
    });

    it('handles thinking_chunk event without error', () => {
        act(() => useRunStore.getState().handleRunOutput({ type: 'started', runId: RUN_1 }));
        act(() => useRunStore.getState().handleRunOutput({ type: 'thinking_chunk', text: 'Hello ' }));
        act(() => useRunStore.getState().handleRunOutput({ type: 'thinking_chunk', text: 'World' }));

        // thinking_chunk is a no-op in the store (streamed to CLI only)
        expect(useRunStore.getState().status).toBe(RunState.RUNNING);
    });

    it('handles acting event', () => {
        act(() => useRunStore.getState().handleRunOutput({ type: 'started', runId: RUN_1 }));
        const action = { type: 'click', thought: 'clicking button' } as never;
        act(() => useRunStore.getState().handleRunOutput({ type: 'acting', action } as unknown as RunOutput));

        const s = useRunStore.getState();
        expect(s.currentAction).toEqual(action);
    });

    it('handles completed event with success', () => {
        act(() => useRunStore.getState().handleRunOutput({ type: 'started', runId: RUN_1 }));
        act(() => useRunStore.getState().handleRunOutput({ type: 'completed', success: true, summary: 'All done' }));

        const s = useRunStore.getState();
        expect(s.status).toBe(RunState.COMPLETED);
        expect(s.success).toBe(true);
        expect(s.summary).toBe('All done');
    });

    it('handles error event', () => {
        act(() => useRunStore.getState().handleRunOutput({ type: 'started', runId: RUN_1 }));
        act(() => useRunStore.getState().handleRunOutput({ type: 'error', error: { message: 'timeout', code: 'ERR', name: 'TimeoutError' } } as unknown as RunOutput));

        const s = useRunStore.getState();
        expect(s.status).toBe(RunState.FAILED);
        expect(s.success).toBe(false);
        expect(s.errorMessage).toBe('timeout');
    });

    it('handles state_updated with history', () => {
        act(() => useRunStore.getState().handleRunOutput({ type: 'started', runId: RUN_1 }));
        const actions = [{ type: 'click' as const }, { type: 'type' as const }];
        act(() => useRunStore.getState().handleRunOutput({
            type: 'state_updated',
            state: { history: actions, plan: null },
        } as unknown as RunOutput));

        expect(useRunStore.getState().history).toEqual(actions);
    });

    it('handles replanning event', () => {
        act(() => useRunStore.getState().handleRunOutput({ type: 'started', runId: RUN_1 }));
        act(() => useRunStore.getState().handleRunOutput({
            type: 'replanning',
            telemetry: { status: 'success', trigger: 'drift', reason: 'page changed' },
        } as unknown as RunOutput));

        expect(useRunStore.getState().replanningEvents).toHaveLength(1);
        expect(useRunStore.getState().replanningEvents[0]!.reason).toBe('page changed');
    });

    it('reset restores initial state', () => {
        act(() => useRunStore.getState().handleRunOutput({ type: 'started', runId: RUN_1 }));
        act(() => useRunStore.getState().reset());

        const s = useRunStore.getState();
        expect(s.status).toBe(RunState.IDLE);
        expect(s.runId).toBeNull();
    });

    it('setPrompt updates prompt', () => {
        act(() => useRunStore.getState().setPrompt('new prompt'));
        expect(useRunStore.getState().prompt).toBe('new prompt');
    });
});
