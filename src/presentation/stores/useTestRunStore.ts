
import { create } from 'zustand';
import type { TestRunEvent } from '@domain/events';
import type { AgentAction, TestRunId } from '@domain/value-objects';
import type { TestStep } from '@domain/entities';
import { trpc } from '../../lib/trpc';
import type { TestInput } from '../../shared/validation';

/**
 * Test Run State (Discriminated Union)
 */
interface BaseState {
    steps: TestStep[];
}

export type IdleState = BaseState & { status: 'idle' };
export type RunningState = BaseState & {
    status: 'running';
    testRunId: TestRunId | null;
    currentPhase: 'observing' | 'thinking' | 'acting' | null;
    currentAction: AgentAction | null;
};
export type CancelledState = BaseState & { status: 'cancelled' };
export type CompletedState = BaseState & {
    status: 'completed';
    success: boolean;
    summary: string;
};
export type ErrorState = BaseState & {
    status: 'error';
    errorMessage: string;
};

export type TestRunState = IdleState | RunningState | CancelledState | CompletedState | ErrorState;

interface TestRunActions {
    startTest: (input: TestInput) => Promise<void>;
    cancelTest: () => Promise<void>;
    reset: () => void;
    handleEvent: (event: TestRunEvent) => void;
}

// Helpers to access properties safely across states (for backward compatibility or ease of use)
// But purely, UI should check status.
// We will export a generic store type.

type TestRunStore = TestRunState & TestRunActions;

const initialBaseState: BaseState = {
    steps: [],
};

const initialState: IdleState = {
    ...initialBaseState,
    status: 'idle',
};

export const useTestRunStore = create<TestRunStore>((set) => ({
    ...initialState,

    startTest: async (input: TestInput) => {
        set({
            ...initialBaseState,
            status: 'running',
            testRunId: null,
            currentPhase: null,
            currentAction: null,
        } as RunningState);

        try {
            await trpc.test.run.mutate(input);
        } catch (err) {
            console.error('Failed to run test:', err);
            set((state) => ({
                ...state,
                status: 'error',
                errorMessage: String(err)
            } as ErrorState));
        }
    },

    cancelTest: async () => {
        try {
            await trpc.test.cancel.mutate();
        } catch (err) {
            console.error('Failed to cancel test:', err);
        }
        set((state) => ({ ...state, status: 'cancelled' } as CancelledState));
    },

    reset: () => set(initialState),

    handleEvent: (event) => {
        set((state) => {
            // Common updates (steps) apply to all states effectively
            // But we need to be careful with transitions.

            switch (event.type) {
                case 'started':
                    return {
                        ...state,
                        status: 'running',
                        testRunId: event.testRunId,
                        currentPhase: null,
                        currentAction: null
                    } as RunningState;

                case 'observing':
                    if (state.status !== 'running') return state;
                    return { ...state, currentPhase: 'observing' };

                case 'thinking':
                    if (state.status !== 'running') return state;
                    return { ...state, currentPhase: 'thinking' };

                case 'acting':
                    if (state.status !== 'running') return state;
                    return { ...state, currentPhase: 'acting', currentAction: event.action };

                case 'step_complete':
                    return {
                        ...state,
                        steps: [...state.steps, event.step],
                        // reset phase if running
                        ...(state.status === 'running' ? { currentPhase: null, currentAction: null } : {})
                    } as TestRunState; // generic cast due to complex conditional



                case 'completed':
                    return {
                        ...state,
                        status: 'completed',
                        success: event.success,
                        summary: event.summary,
                    } as CompletedState;

                case 'cancelled':
                    return { ...state, status: 'cancelled' } as CancelledState;

                case 'error':
                    return {
                        ...state,
                        status: 'error',
                        errorMessage: event.error.message,
                    } as ErrorState;

                default:
                    return state;
            }
        });
    },
}));
