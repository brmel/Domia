import { create } from 'zustand';
import type { TestRunEvent } from '@domain/events';
import type { AgentAction, TestRunId } from '@domain/value-objects';
import type { TestStep } from '@domain/entities';

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

    // Screenshots
    screenshots: Buffer[];
    latestScreenshot: Buffer | null;

    // Form state
    url: string;
    prompt: string;
    headless: boolean;
    maxSteps: number;
}

interface TestRunActions {
    // Form actions
    setUrl: (url: string) => void;
    setPrompt: (prompt: string) => void;
    setHeadless: (headless: boolean) => void;
    setMaxSteps: (maxSteps: number) => void;

    // Test actions
    startTest: () => Promise<void>;
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
    url: '',
    prompt: '',
    headless: true,
    maxSteps: 20,
};

export const useTestRunStore = create<TestRunStore>((set, get) => ({
    ...initialState,

    // Form actions
    setUrl: (url) => set({ url }),
    setPrompt: (prompt) => set({ prompt }),
    setHeadless: (headless) => set({ headless }),
    setMaxSteps: (maxSteps) => set({ maxSteps }),

    // Test actions
    startTest: async () => {
        const { url, prompt, headless, maxSteps } = get();

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

        // Call IPC
        await window.api.test.run({
            url,
            prompt,
            options: { headless, maxSteps },
        });
    },

    cancelTest: async () => {
        await window.api.test.cancel();
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
