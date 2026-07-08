import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RunOutput } from '@backend/dto';
import type { AgentAction, RunId } from '@domain/value-objects';
import type { Plan } from '@domain/entities/Plan';
import { RunState } from '@domain/enums';
import type { UIPlatformType } from '@frontend/lib/platformRegistry';
import type { PlatformFieldValue } from '@frontend/lib/platformRegistry';

interface RunStoreState {
    status: RunState;
    runId: RunId | null;

    currentAction: AgentAction | null;
    plan: Plan | null;

    success: boolean | null;
    summary: string | null;
    errorMessage: string | null;

    history: AgentAction[];

    prompt: string;
    selectedPlatform: UIPlatformType;
    platformData: PlatformFieldValue;
}

interface RunStoreActions {
    reset: () => void;
    setPrompt: (prompt: string) => void;
    setSelectedPlatform: (platform: UIPlatformType) => void;
    setPlatformData: (data: PlatformFieldValue) => void;
    setStatus: (status: RunState) => void;
    handleRunOutput: (event: RunOutput) => void;
}

type RunStore = RunStoreState & RunStoreActions;

const initialState: RunStoreState = {
    status: RunState.IDLE,
    runId: null,
    currentAction: null,
    plan: null,
    success: null,
    summary: null,
    errorMessage: null,
    history: [],
    prompt: 'verify that brahim is smiling',
    selectedPlatform: 'web',
    platformData: { url: 'https://ibraverse.ca' },
};

export const useRunStore = create<RunStore>()(persist((set) => ({
    ...initialState,

    reset: (): void => set(initialState),
    setPrompt: (prompt: string): void => set({ prompt }),
    setSelectedPlatform: (selectedPlatform: UIPlatformType): void => set({ selectedPlatform }),
    setPlatformData: (platformData: PlatformFieldValue): void => set({ platformData }),
    setStatus: (status: RunState): void => set({ status }),

    handleRunOutput: (event: RunOutput): void => {
        switch (event.type) {
            case 'started':
                set({
                    runId: event.runId,
                    status: RunState.RUNNING,
                    history: [],
                    plan: null,
                    currentAction: null,
                    success: null,
                    summary: null,
                    errorMessage: null,
                });
                break;
            case 'thinking_chunk':
                break;
            case 'acting':
                set({ currentAction: event.action });
                break;
            case 'state_updated':
                set((state) => ({
                    history: [...(event.state.history || state.history)],
                    plan: event.state.plan || state.plan,
                    currentAction: null,
                }));
                break;
            case 'observation':
                // ambient perception telemetry — not run-panel state
                break;
            case 'completed':
                set({
                    status: RunState.COMPLETED,
                    success: event.success,
                    summary: event.summary ?? null,
                    currentAction: null,
                });
                break;
            case 'iterating':
                set({
                    summary: `Iterating: ${event.summary}`,
                    currentAction: null,
                });
                break;
            case 'cancelled':
                set({
                    status: RunState.CANCELLED,
                    success: false,
                    summary: event.summary ?? null,
                    currentAction: null,
                });
                break;
            case 'suspended':
                set({
                    runId: event.runId,
                    status: RunState.SUSPENDED,
                    summary: event.reason,
                    currentAction: null,
                });
                break;
            case 'error':
                set({
                    status: RunState.FAILED,
                    success: false,
                    errorMessage: event.error.message,
                });
                break;
        }
    },
}), {
    name: 'domia-compose-draft-v1',
    partialize: (state): Partial<RunStoreState> => ({
        prompt: state.prompt,
        selectedPlatform: state.selectedPlatform,
        platformData: state.platformData,
    }),
}));
