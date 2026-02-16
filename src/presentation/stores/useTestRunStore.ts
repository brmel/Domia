import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TestRunEvent } from '@domain/events';
import type { AgentAction, TestRunId } from '@domain/value-objects';
import type { Plan } from '@domain/entities/Plan';
import type { RecoveryReplayTelemetry, ReplanningTelemetry } from '@application/dtos';
import { AgentStatus } from '../../domain/types/AgentStatus';
import type { PlatformType } from '../../domain/types/PlatformConfig';
import type { PlatformFieldValue } from '../config/platformRegistry';

/**
 * TestRun state for UI
 */
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
    selectedPlatform: PlatformType;
    platformData: PlatformFieldValue;
    temporalObservation: boolean;
    temporalMode: 'off' | 'baseline' | 'adaptive' | 'forensic';
    temporalBaselineIntervalMs: number;
    temporalBurstIntervalMs: number;
    temporalMaxFramesPerWindow: number;
    temporalPromptTokenBudget: number;
    temporalRedactSensitive: boolean;
    temporalPersistWindow: boolean;

    recoveryReplay: RecoveryReplayTelemetry | null;
    replanningEvents: ReplanningTelemetry[];
}

interface TestRunActions {
    reset: () => void;

    setUrl: (url: string) => void;
    setPrompt: (prompt: string) => void;
    setSelectedPlatform: (platform: PlatformType) => void;
    setPlatformData: (data: PlatformFieldValue) => void;
    setTemporalObservation: (value: boolean) => void;
    setTemporalMode: (value: 'off' | 'baseline' | 'adaptive' | 'forensic') => void;
    setTemporalBaselineIntervalMs: (value: number) => void;
    setTemporalBurstIntervalMs: (value: number) => void;
    setTemporalMaxFramesPerWindow: (value: number) => void;
    setTemporalPromptTokenBudget: (value: number) => void;
    setTemporalRedactSensitive: (value: boolean) => void;
    setTemporalPersistWindow: (value: boolean) => void;
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
    temporalObservation: false,
    temporalMode: 'adaptive',
    temporalBaselineIntervalMs: 1000,
    temporalBurstIntervalMs: 120,
    temporalMaxFramesPerWindow: 12,
    temporalPromptTokenBudget: 400,
    temporalRedactSensitive: true,
    temporalPersistWindow: true,
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
    setSelectedPlatform: (selectedPlatform: PlatformType): void => set({ selectedPlatform }),
    setPlatformData: (platformData: PlatformFieldValue): void => set({
        platformData,
        ...(get().selectedPlatform === 'web' && 'url' in platformData && typeof platformData.url === 'string'
            ? { url: platformData.url }
            : {})
    }),
    setTemporalObservation: (temporalObservation: boolean): void => set({ temporalObservation }),
    setTemporalMode: (temporalMode: 'off' | 'baseline' | 'adaptive' | 'forensic'): void => set({ temporalMode }),
    setTemporalBaselineIntervalMs: (temporalBaselineIntervalMs: number): void => set({ temporalBaselineIntervalMs }),
    setTemporalBurstIntervalMs: (temporalBurstIntervalMs: number): void => set({ temporalBurstIntervalMs }),
    setTemporalMaxFramesPerWindow: (temporalMaxFramesPerWindow: number): void => set({ temporalMaxFramesPerWindow }),
    setTemporalPromptTokenBudget: (temporalPromptTokenBudget: number): void => set({ temporalPromptTokenBudget }),
    setTemporalRedactSensitive: (temporalRedactSensitive: boolean): void => set({ temporalRedactSensitive }),
    setTemporalPersistWindow: (temporalPersistWindow: boolean): void => set({ temporalPersistWindow }),

    setStatus: (status: AgentStatus): void => set({ status }),

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
}), {
    name: 'domia-compose-draft-v1',
    partialize: (state): Partial<TestRunStoreState> => ({
        url: state.url,
        prompt: state.prompt,
        selectedPlatform: state.selectedPlatform,
        platformData: state.platformData,
        temporalObservation: state.temporalObservation,
        temporalMode: state.temporalMode,
        temporalBaselineIntervalMs: state.temporalBaselineIntervalMs,
        temporalBurstIntervalMs: state.temporalBurstIntervalMs,
        temporalMaxFramesPerWindow: state.temporalMaxFramesPerWindow,
        temporalPromptTokenBudget: state.temporalPromptTokenBudget,
        temporalRedactSensitive: state.temporalRedactSensitive,
        temporalPersistWindow: state.temporalPersistWindow
    })
}));
