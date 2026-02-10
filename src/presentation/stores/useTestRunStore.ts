import { create } from 'zustand';
import type { TestRunEvent } from '@domain/events';
import type { AgentAction, TestRunId } from '@domain/value-objects';
import type { Plan } from '@domain/entities/Plan';
import { AgentStatus } from '../../domain/types/AgentStatus';

/**
 * TestRun state for UI
 */
export interface TestRunStoreState {
    // Current run status
    status: AgentStatus;
    testRunId: TestRunId | null;

    // Progress tracking
    currentPhase: 'planning' | 'executing' | 'verifying' | null;
    currentAction: AgentAction | null;
    plan: Plan | null;

    // Results
    success: boolean | null;
    summary: string | null;
    errorMessage: string | null;

    // Step history
    history: AgentAction[];

    // Input Persistence
    url: string;
    prompt: string;
}

interface TestRunActions {
    // Test actions
    reset: () => void;

    setUrl: (url: string) => void;
    setPrompt: (prompt: string) => void;
    setStatus: (status: AgentStatus) => void;

    // Event handling
    handleEvent: (event: TestRunEvent) => void;
}

type TestRunStore = TestRunStoreState & TestRunActions;

const initialState: TestRunStoreState = {
    status: AgentStatus.IDLE,
    testRunId: null,
    currentPhase: null,
    currentAction: null,
    plan: null,
    success: null,
    summary: null,
    errorMessage: null,
    history: [],
    url: 'https://www.google.com',
    prompt: 'Validate that the search button is centered on the page',
};

export const useTestRunStore = create<TestRunStore>((set) => ({
    ...initialState,

    reset: (): void => set(initialState),

    setUrl: (url: string) => set({ url }),
    setPrompt: (prompt: string) => set({ prompt }),

    setStatus: (status: AgentStatus): void => set({ status }),

    // Event handling from IPC
    handleEvent: (event: TestRunEvent): void => {
        switch (event.type) {
            case 'started':
                set({ testRunId: event.testRunId, status: AgentStatus.RUNNING });
                break;

            case 'observing':
                set({ currentPhase: 'planning' }); // optimizing to calling observing "planning" or just ignore phase updates for now if strict
                break;

            case 'planning':
                set({ currentPhase: 'planning' });
                break;

            case 'thinking':
                set({ currentPhase: 'executing' });
                break;

            case 'acting':
                set({ currentPhase: 'executing', currentAction: event.action });
                break;

            case 'state_updated':
                set((state) => ({
                    history: [...(event.state.history || state.history)],
                    plan: event.state.plan || state.plan,
                    currentAction: null
                }));
                break;

            case 'completed':
                set({
                    status: AgentStatus.COMPLETED,
                    success: event.success,
                    summary: event.summary,
                    currentPhase: null,
                    currentAction: null,
                });
                break;

            case 'cancelled':
                set({ status: AgentStatus.CANCELLED, currentPhase: null });
                break;

            case 'paused':
                set({ status: AgentStatus.PAUSED });
                break;

            case 'resumed':
                set({ status: AgentStatus.RUNNING });
                break;

            case 'error':
                set({
                    status: AgentStatus.FAILED,
                    errorMessage: event.error.message,
                    currentPhase: null,
                });
                break;
        }
    },
}));
