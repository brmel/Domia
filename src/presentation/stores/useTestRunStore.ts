import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TestRunEvent } from '@domain/events';
import type { AgentAction, TestRunId } from '@domain/value-objects';
import type { Plan } from '@domain/entities/Plan';
import type { RecoveryReplayTelemetry, ReplanningTelemetry } from '@application/dtos';
import { AgentStatus } from '../../domain/types/AgentStatus';
import type { BuiltInPlatformType } from '../../domain/types/PlatformConfig';
import type { PlatformFieldValue } from '../config/platformRegistry';

export interface TestRunStoreState {
    status: AgentStatus;
    testRunId: TestRunId | null;

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
    setStatus: (status: AgentStatus) => void;

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
    url: 'https://ibraverse.ca',
    prompt: 'verify that brahim is smiling',
    selectedPlatform: 'web',
    platformData: { url: 'https://ibraverse.ca' },
    recoveryReplay: null,
    replanningEvents: [],
};

export const useTestRunStore = create<TestRunStore>()(persist((set, get) => ({
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
    setStatus: (status: AgentStatus): void => set({ status }),

    handleEvent: (event: TestRunEvent): void => {
        switch (event.type) {
            case 'started':
                set({ testRunId: event.testRunId, status: AgentStatus.RUNNING });
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
                    status: AgentStatus.COMPLETED,
                    success: event.success,
                    summary: event.summary,
                    currentPhase: null,
                    currentAction: null,
                });
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
}), {
    name: 'domia-compose-draft-v1',
    partialize: (state): Partial<TestRunStoreState> => ({
        url: state.url,
        prompt: state.prompt,
        selectedPlatform: state.selectedPlatform,
        platformData: state.platformData,
    })
}));
