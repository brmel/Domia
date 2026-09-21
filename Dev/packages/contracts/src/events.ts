import type { ModuleId, RunId, CaseId, PersonaId, ScheduleId } from './ids.js';
import type { OutcomeStatus, ArtifactRef } from './outcome.js';
import type { AgentTurnSummary, ToolCallSummary, RunReport } from './loop.js';
import type { PlanDiff } from './plan.js';
import type { Signal } from './signal.js';

export interface DomiaEventMap {
  'module.loaded': { module: ModuleId; version: string };
  'run.started': { runId: RunId; caseId: CaseId; request: string; parentRunId?: RunId };
  'run.turn': { runId: RunId; seq: number; turn: AgentTurnSummary };
  'run.call': { runId: RunId; call: ToolCallSummary; status: OutcomeStatus };
  'run.plan.changed': { runId: RunId; revision: number; diff: PlanDiff };
  'run.waiting_user': { runId: RunId; question: string; kind: 'ask' | 'approval' | 'takeover' };
  'run.signal': { runId: RunId; signal: Signal };
  'run.spawned': { runId: RunId; childRunId: RunId; persona: PersonaId };
  'run.terminal': { runId: RunId; status: OutcomeStatus; report: RunReport };
  'artifact.saved': { runId?: RunId; ref: ArtifactRef };
  'schedule.fired': { scheduleId: ScheduleId; runId: RunId };
}

export type Unsubscribe = () => void;

export interface EventBus {
  emit<K extends keyof DomiaEventMap>(type: K, payload: DomiaEventMap[K]): void;
  on<K extends keyof DomiaEventMap>(type: K, fn: (p: DomiaEventMap[K]) => void): Unsubscribe;
  /** Back-pressure-safe: bounded buffer, drop-oldest with a counter. */
  stream<K extends keyof DomiaEventMap>(type: K, signal?: AbortSignal): AsyncIterable<DomiaEventMap[K]>;
}
