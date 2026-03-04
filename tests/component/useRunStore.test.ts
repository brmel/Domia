import { describe, it, expect, beforeEach } from 'vitest';
import { useRunStore } from '@presentation/stores/useRunStore';
import { RunState } from '@domain/enums/RunState';
import type { RunEvent } from '@domain/events';
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
        const event: RunEvent = { type: 'started', runId: RUN_1 };
        act(() => useRunStore.getState().handleEvent(event));

        const s = useRunStore.getState();
        expect(s.status).toBe(RunState.RUNNING);
        expect(s.runId).toBe(RUN_1);
    });

    it('handles thinking_chunk event without error', () => {
        act(() => useRunStore.getState().handleEvent({ type: 'started', runId: RUN_1 }));
        act(() => useRunStore.getState().handleEvent({ type: 'thinking_chunk', text: 'Hello ' }));
        act(() => useRunStore.getState().handleEvent({ type: 'thinking_chunk', text: 'World' }));

        // thinking_chunk is a no-op in the store (streamed to CLI only)
        expect(useRunStore.getState().status).toBe(RunState.RUNNING);
    });

    it('handles acting event', () => {
        act(() => useRunStore.getState().handleEvent({ type: 'started', runId: RUN_1 }));
        const action = { type: 'click', thought: 'clicking button' } as never;
        act(() => useRunStore.getState().handleEvent({ type: 'acting', action } as unknown as RunEvent));

        const s = useRunStore.getState();
        expect(s.currentAction).toEqual(action);
    });

    it('handles completed event with success', () => {
        act(() => useRunStore.getState().handleEvent({ type: 'started', runId: RUN_1 }));
        act(() => useRunStore.getState().handleEvent({ type: 'completed', success: true, summary: 'All done' }));

        const s = useRunStore.getState();
        expect(s.status).toBe(RunState.COMPLETED);
        expect(s.success).toBe(true);
        expect(s.summary).toBe('All done');
    });

    it('handles error event', () => {
        act(() => useRunStore.getState().handleEvent({ type: 'started', runId: RUN_1 }));
        act(() => useRunStore.getState().handleEvent({ type: 'error', error: { message: 'timeout', code: 'ERR', name: 'TimeoutError' } } as unknown as RunEvent));

        const s = useRunStore.getState();
        expect(s.status).toBe(RunState.FAILED);
        expect(s.errorMessage).toBe('timeout');
    });

    it('handles state_updated with history', () => {
        act(() => useRunStore.getState().handleEvent({ type: 'started', runId: RUN_1 }));
        const actions = [{ type: 'click' as const }, { type: 'type' as const }];
        act(() => useRunStore.getState().handleEvent({
            type: 'state_updated',
            state: { history: actions, plan: null },
        } as unknown as RunEvent));

        expect(useRunStore.getState().history).toEqual(actions);
    });

    it('handles replanning event', () => {
        act(() => useRunStore.getState().handleEvent({ type: 'started', runId: RUN_1 }));
        act(() => useRunStore.getState().handleEvent({
            type: 'replanning',
            telemetry: { status: 'success', trigger: 'drift', reason: 'page changed' },
        } as unknown as RunEvent));

        expect(useRunStore.getState().replanningEvents).toHaveLength(1);
        expect(useRunStore.getState().replanningEvents[0]!.reason).toBe('page changed');
    });

    it('reset restores initial state', () => {
        act(() => useRunStore.getState().handleEvent({ type: 'started', runId: RUN_1 }));
        act(() => useRunStore.getState().reset());

        const s = useRunStore.getState();
        expect(s.status).toBe(RunState.IDLE);
        expect(s.runId).toBeNull();
    });

    it('setUrl also updates web platform data', () => {
        act(() => useRunStore.getState().setUrl('https://example.com'));

        const s = useRunStore.getState();
        expect(s.url).toBe('https://example.com');
        expect((s.platformData as { url?: string }).url).toBe('https://example.com');
    });

    it('setPrompt updates prompt', () => {
        act(() => useRunStore.getState().setPrompt('new prompt'));
        expect(useRunStore.getState().prompt).toBe('new prompt');
    });
});
