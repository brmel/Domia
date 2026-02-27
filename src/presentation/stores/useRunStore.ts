import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RunEvent } from '@domain/events';
import type { AgentAction, RunId } from '@domain/value-objects';
import type { Plan } from '@domain/entities/Plan';
import type { RecoveryReplayTelemetry, ReplanningTelemetry } from '@application/dtos';
import { RunState } from '@domain/enums/RunState';
import type { BuiltInPlatformType } from '../../domain/types/PlatformConfig';
import type { PlatformFieldValue } from '../config/platformRegistry';

export interface RunStoreState {
    status: RunState;
    runId: RunId | null;

    currentPhase: 'planning' | 'executing' | 'verifying' | null;
    currentAction: AgentAction | null;
    plan: Plan | null;

    success: boolean | null;
    summary: string | null;
    errorMessage: string | null;

    history: AgentAction[];

    url: string;
    prompt: string;
    selectedPlatform: BuiltInPlatformType;
    platformData: PlatformFieldValue;

    recoveryReplay: RecoveryReplayTelemetry | null;
    replanningEvents: ReplanningTelemetry[];
}

interface TestRunActions {
    reset: () => void;

    setUrl: (url: string) => void;
    setPrompt: (prompt: string) => void;
    setSelectedPlatform: (platform: BuiltInPlatformType) => void;
    setPlatformData: (data: PlatformFieldValue) => void;
    setStatus: (status: RunState) => void;

    handleEvent: (event: RunEvent) => void;
}

type TestRunStore = RunStoreState & TestRunActions;

const initialState: RunStoreState = {
    status: RunState.IDLE,
    runId: null,
    currentPhase: null,
    currentAction: null,
    plan: null,
    success: null,
    summary: null,
    errorMessage: null,
    history: [],
    url: 'https://ibraverse.ca',
    prompt: 'verify that brahim is smiling',
    selectedPlatform: 'web',
    platformData: { url: 'https://ibraverse.ca' },
    recoveryReplay: null,
    replanningEvents: [],
};

export const useRunStore = create<TestRunStore>()(persist((set, get) => ({
    ...initialState,

    reset: (): void => set(initialState),

    setUrl: (url: string): void => set((state) => ({
        url,
        platformData: state.selectedPlatform === 'web'
            ? { ...(state.platformData as { url?: string }), url }
            : state.platformData
    })),
    setPrompt: (prompt: string): void => set({ prompt }),
    setSelectedPlatform: (selectedPlatform: BuiltInPlatformType): void => set({ selectedPlatform }),
    setPlatformData: (platformData: PlatformFieldValue): void => set({
        platformData,
        ...(get().selectedPlatform === 'web' && 'url' in platformData && typeof platformData.url === 'string'
            ? { url: platformData.url }
            : {})
    }),
    setStatus: (status: RunState): void => set({ status }),

    handleEvent: (event: RunEvent): void => {
        switch (event.type) {
            case 'started':
                set({
                    runId: event.runId,
                    status: RunState.RUNNING,
                    history: [],
                    plan: null,
                    currentAction: null,
                    currentPhase: null,
                    success: null,
                    summary: null,
                    errorMessage: null,
                    recoveryReplay: null,
                    replanningEvents: [],
                });
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

            case 'recovery_replay':
                set({ recoveryReplay: event.telemetry });
                break;

            case 'replanning':
                set((state) => ({ replanningEvents: [...state.replanningEvents, event.telemetry] }));
                break;

            case 'completed':
                set({
                    status: RunState.COMPLETED,
                    success: event.success,
                    summary: event.summary,
                    currentPhase: null,
                    currentAction: null,
                });
                break;

            case 'error':
                set({
                    status: RunState.FAILED,
                    errorMessage: event.error.message,
                    currentPhase: null,
                });
                break;
        }
    },
}), {
    name: 'domia-compose-draft-v1',
    partialize: (state): Partial<RunStoreState> => ({
        url: state.url,
        prompt: state.prompt,
        selectedPlatform: state.selectedPlatform,
        platformData: state.platformData,
    })
}));
