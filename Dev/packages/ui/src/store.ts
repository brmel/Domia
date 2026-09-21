import { create } from 'zustand';
import type { CaseId, RunId } from '@domia/contracts';

export type View = 'cases' | 'runs' | 'audits' | 'skills' | 'memory' | 'settings';

interface NavState {
  view: View;
  activeRunId: RunId | null;
  activeCaseId: CaseId | null;
  openRun(id: RunId): void;
  openCases(): void;
  openRuns(): void;
  openAudits(): void;
  openSkills(): void;
  openMemory(): void;
  openSettings(): void;
  selectCase(id: CaseId | null): void;
}

export const useNav = create<NavState>((set) => ({
  view: 'cases',
  activeRunId: null,
  activeCaseId: null,
  openRun: (id) => set({ view: 'runs', activeRunId: id }),
  openCases: () => set({ view: 'cases' }),
  openRuns: () => set({ view: 'runs', activeRunId: null }),
  openAudits: () => set({ view: 'audits' }),
  openSkills: () => set({ view: 'skills' }),
  openMemory: () => set({ view: 'memory' }),
  openSettings: () => set({ view: 'settings' }),
  selectCase: (id) => set({ activeCaseId: id }),
}));
