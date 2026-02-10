import { create } from 'zustand';
import type { TestRunEvent } from '@domain/events';
import type { AgentAction, TestRunId } from '@domain/value-objects';
import type { Plan } from '@domain/entities/Plan';

/**
 * TestRun state for UI
 */
/**
 * TestRun state for UI
 */
export interface TestRunStoreState {
    // Current run status
    status: 'idle' | 'running' | 'cancelled' | 'completed' | 'error';
    testRunId: TestRunId | null;

    // Progress tracking
    currentPhase: 'observing' | 'thinking' | 'acting' | null;
    currentAction: AgentAction | null;
    plan: Plan | null;
    history: readonly AgentAction[];

    // Results
    success: boolean | null;
    summary: string | null;
    errorMessage: string | null;
}

interface TestRunActions {
    // Test actions
    reset: () => void;

    // Event handling
    handleEvent: (event: TestRunEvent) => void;
}

type TestRunStore = TestRunStoreState & TestRunActions;

const initialState: TestRunStoreState = {
    status: 'idle',
    testRunId: null,
    currentPhase: null,
    currentAction: null,
    plan: null,
    history: [],
    success: null,
    summary: null,
    errorMessage: null,
};

export const useTestRunStore = create<TestRunStore>((set) => ({
    ...initialState,

    reset: (): void => set(initialState),

    // Event handling from IPC
    handleEvent: (event: TestRunEvent): void => {
        switch (event.type) {
            case 'started':
                set({ testRunId: event.testRunId, status: 'running' });
                break;

            case 'observing':
                set({ currentPhase: 'observing' });
                break;

            case 'thinking':
                set({ currentPhase: 'thinking' });
                break;

            case 'acting':
                set({ currentPhase: 'acting', currentAction: event.action });
                break;

            case 'state_updated':
                set((state) => ({
                    plan: event.state.plan || state.plan,
                    history: event.state.history || state.history,
                    currentPhase: null,
                }));
                break;

            case 'completed':
                set({
                    status: 'completed',
                    success: event.success,
                    summary: event.summary,
                    currentPhase: null,
                });
                break;

            case 'cancelled':
                set({ status: 'cancelled', currentPhase: null });
                break;

            case 'error':
                set({
                    status: 'error',
                    errorMessage: event.error.message,
                    currentPhase: null,
                });
                break;
        }
    },
}));
