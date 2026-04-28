import { create } from 'zustand';

interface StepInspectorState {
    isOpen: boolean;
    runId: string | null;
    stepNumber: number | null;

    open: (runId: string, stepNumber: number) => void;
    close: () => void;
}

export const useStepInspectorStore = create<StepInspectorState>((set) => ({
    isOpen: false,
    runId: null,
    stepNumber: null,

    open: (runId, stepNumber): void => set({ isOpen: true, runId, stepNumber }),
    close: (): void => set({ isOpen: false, runId: null, stepNumber: null }),
}));
