import type { ModuleResult } from './errors.js';
import type { Outcome, OutcomeStatus, TokenUsage } from './outcome.js';
import type { PersonaId, PromptRef, RunId } from './ids.js';
import type { Context } from './context.js';
import type { CaseContext } from './case.js';
import type { CaseId } from './ids.js';
import type { TargetSession } from './tools.js';
import type { PlanContext } from './plan.js';
import type { ToolCall, ToolManifest, ToolOutput } from './tools.js';
import type { ModelSpec } from './agent.js';
import type { Plan, PlanDiff } from './plan.js';
import type { Signal } from './signal.js';

export type ToolsetSelector = 'full' | 'observe-only' | 'no-target' | readonly string[];

export interface Persona {
  readonly id: PersonaId;
  readonly prompt: PromptRef;
  readonly model?: ModelSpec;
  readonly toolset: ToolsetSelector;
}

/** A soft ceiling the loop honors as a safety stop (the only enforced bound). */
export interface BudgetInformant { readonly maxTurns?: number }

export interface RunOptions {
  /** 'never' removes user.ask; the prompt says "state assumptions instead". */
  readonly questions?: 'allowed' | 'never';
  /** Gate risk:'dangerous' tools behind user confirmation. */
  readonly approvals?: 'off' | 'dangerous';
  /** D12 — false ⇒ user.ask degrades to suspend+notify; set by the surface. */
  readonly interactive?: boolean;
  readonly persona?: PersonaId;
  readonly personaOverrides?: Readonly<Record<string, Partial<Persona>>>;
  readonly budgetHints?: BudgetInformant;
}

export interface RunBinding {
  readonly caseCtx: CaseContext;
  readonly request: string;
  readonly options?: RunOptions;
  readonly parentRunId?: RunId;
}

export interface RunReport {
  readonly summary: string;
  readonly verdict?: 'pass' | 'fail';
  readonly value?: unknown;
  readonly plan?: Plan;
  readonly stats: { readonly turns: number; readonly calls: number; readonly usage: TokenUsage; readonly durationMs: number };
}

export type HumanReply =
  | { readonly kind: 'answer'; readonly text: string }
  | { readonly kind: 'approve'; readonly approved: boolean }
  | { readonly kind: 'takeover_done'; readonly note?: string };

export interface AgentTurnSummary { readonly kind: 'act' | 'ask' | 'final'; readonly summary: string }
export interface ToolCallSummary { readonly callId: string; readonly name: string }

export type RunEvent =
  | { readonly type: 'sync'; readonly view: unknown }
  | { readonly type: 'turn'; readonly runId: RunId; readonly seq: number; readonly turn: AgentTurnSummary }
  | { readonly type: 'call'; readonly runId: RunId; readonly call: ToolCallSummary; readonly status: OutcomeStatus }
  | { readonly type: 'plan'; readonly runId: RunId; readonly revision: number; readonly diff: PlanDiff }
  | { readonly type: 'waiting_user'; readonly runId: RunId; readonly question: string; readonly kind: 'ask' | 'approval' | 'takeover' }
  | { readonly type: 'signal'; readonly runId: RunId; readonly signal: Signal }
  | { readonly type: 'spawned'; readonly runId: RunId; readonly childRunId: RunId; readonly persona: PersonaId }
  | { readonly type: 'terminal'; readonly runId: RunId; readonly status: OutcomeStatus; readonly report: RunReport };

export interface RunConfig { readonly approvals?: 'off' | 'dangerous' }
export interface RunState { readonly status: 'allocated' | 'running' | 'paused' | 'waiting_user' | 'suspended' | 'terminal'; readonly turns: number }

export interface LoopRun extends Context<RunConfig, RunState> {
  readonly runId: RunId;
  start(): Promise<ModuleResult<Outcome<RunReport>>>;
  pause(): Promise<ModuleResult<void>>;
  resume(): Promise<ModuleResult<void>>;
  cancel(reason: string): Promise<ModuleResult<void>>;
  answer(reply: HumanReply): Promise<ModuleResult<void>>;
  events(signal?: AbortSignal): AsyncIterable<RunEvent>;
}

export interface LoopRunView {
  readonly runId: RunId;
  readonly options: RunOptions;
  readonly capabilities: readonly string[];
  /** What the run was asked to do — lets a belt tool decide what to offer. */
  readonly request: string;
}

/**
 * What a meta-tool handler may touch while a run is live. Declared here rather
 * than left `unknown` so belt tools — including ones in other packages — are
 * type-safe without reaching into @domia/loop.
 */
export interface LoopRunInternals {
  readonly runId: RunId;
  readonly caseId: CaseId;
  readonly session: TargetSession;
  readonly plan: PlanContext;
  readonly options: RunOptions;
  /** Park for a human; degrades to suspend when nobody is attached (D12). */
  requestHuman(question: string, kind: 'ask' | 'approval' | 'takeover'): Promise<ModuleResult<HumanReply>>;
  suspend(reason: string): Promise<ModuleResult<void>>;
  emit(e: RunEvent): void;
}

/** EP.MetaTool (many). */
export interface MetaToolHandler {
  manifests(run: LoopRunView): readonly ToolManifest[];
  dispatch(call: ToolCall, run: LoopRunInternals): Promise<ModuleResult<Outcome<ToolOutput>>>;
}

/** EP.LoopEngine (one). */
export interface LoopEngine {
  registerMetaTool(h: MetaToolHandler): void;
  personas(): readonly Persona[];
  alloc(binding: RunBinding): Promise<ModuleResult<LoopRun>>;
}
