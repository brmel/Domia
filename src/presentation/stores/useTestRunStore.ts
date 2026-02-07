import { create } from 'zustand';
import type { TestRunEvent } from '@domain/events';
import type { AgentAction, TestRunId } from '@domain/value-objects';
import type { TestStep } from '@domain/entities';
import { trpc } from '../../lib/trpc';
import type { TestInput } from '../../shared/validation';

/**
 * Test run state for UI
 */
export interface TestRunState {
    // Current run status
    status: 'idle' | 'running' | 'cancelled' | 'completed' | 'error';
    testRunId: TestRunId | null;

    // Progress tracking
    currentPhase: 'observing' | 'thinking' | 'acting' | null;
    currentAction: AgentAction | null;
    steps: TestStep[];

    // Results
    success: boolean | null;
    summary: string | null;
    errorMessage: string | null;

    // Screenshots (base64 encoded strings received over IPC)
    screenshots: string[];
    latestScreenshot: string | null;
}

interface TestRunActions {
    // Test actions
    startTest: (input: TestInput) => Promise<void>;
    cancelTest: () => Promise<void>;
    reset: () => void;

    // Event handling
    handleEvent: (event: TestRunEvent) => void;
}

type TestRunStore = TestRunState & TestRunActions;

const initialState: TestRunState = {
    status: 'idle',
    testRunId: null,
    currentPhase: null,
    currentAction: null,
    steps: [],
    success: null,
    summary: null,
    errorMessage: null,
    screenshots: [],
    latestScreenshot: null,
};

export const useTestRunStore = create<TestRunStore>((set) => ({
    ...initialState,

    // Test actions
    startTest: async (input: TestInput) => {
        // Reset state for new run
        set({
            status: 'running',
            testRunId: null,
            currentPhase: null,
            currentAction: null,
            steps: [],
            success: null,
            summary: null,
            errorMessage: null,
            screenshots: [],
            latestScreenshot: null,
        });

        try {
            await trpc.test.run.mutate(input);
        } catch (err) {
            console.error('Failed to run test:', err);
            set({ status: 'error', errorMessage: String(err) });
        }
    },

    cancelTest: async () => {
        try {
            await trpc.test.cancel.mutate();
        } catch (err) {
            console.error('Failed to cancel test:', err);
        }
        set({ status: 'cancelled' });
    },

    reset: () => set(initialState),

    // Event handling from IPC
    handleEvent: (event) => {
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

            case 'step_complete':
                set((state) => ({
                    steps: [...state.steps, event.step],
                    currentPhase: null,
                    currentAction: null,
                }));
                break;

            case 'screenshot':
                set((state) => ({
                    screenshots: [...state.screenshots, event.data],
                    latestScreenshot: event.data,
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
