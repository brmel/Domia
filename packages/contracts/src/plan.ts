import type { ModuleResult } from './errors.js';
import type { Outcome } from './outcome.js';
import type { ItemId, PlanId, RunId } from './ids.js';
import type { Context } from './context.js';
import type { ToolCall, ToolManifest, ToolOutput } from './tools.js';
import type { Signal } from './signal.js';
import type { Unsubscribe } from './events.js';

export interface PlanItem {
  readonly id: ItemId;
  readonly seq: number;
  readonly title: string;
  /** What "done" means for this item. */
  readonly intent: string;
  readonly status: 'pending' | 'active' | 'done' | 'dropped';
  readonly note?: string;
}

export interface Plan {
  readonly id: PlanId;
  readonly runId: RunId;
  readonly goal: string;
  readonly items: readonly PlanItem[];
  readonly revision: number;
  readonly status: 'empty' | 'active' | 'settled';
}

export type PlanOp =
  | { readonly op: 'propose'; readonly items: readonly { title: string; intent: string }[] }
  | { readonly op: 'add'; readonly title: string; readonly intent: string; readonly afterSeq?: number }
  | { readonly op: 'start'; readonly itemId: ItemId }
  | { readonly op: 'complete'; readonly itemId: ItemId; readonly note?: string }
  | { readonly op: 'drop'; readonly itemId: ItemId; readonly reason: string }
  | { readonly op: 'revise'; readonly ops: readonly PlanOp[] }
  | { readonly op: 'note'; readonly text: string };

export interface PlanDiff { readonly changed: readonly ItemId[]; readonly summary: string }

export interface PlanRevision {
  readonly revision: number;
  readonly op: PlanOp;
  readonly origin: 'agent' | 'user';
  readonly at: string;
  readonly diff: PlanDiff;
}

export interface PlanConfig { readonly staleAfterTurns?: number }
export interface PlanCtxState { readonly revision: number }

export interface PlanContext extends Context<PlanConfig, PlanCtxState> {
  current(): Plan;
  apply(op: PlanOp, origin: 'agent' | 'user'): Promise<ModuleResult<PlanRevision>>;
  toolManifests(): readonly ToolManifest[];
  dispatch(call: ToolCall): Promise<ModuleResult<Outcome<ToolOutput>>>;
  onChange(fn: (rev: PlanRevision) => void): Unsubscribe;
  staleness(): Signal | null;
}

/** EP.PlanService (one). */
export interface PlanService {
  allocContext(runId: RunId, goal: string): Promise<ModuleResult<PlanContext>>;
  get(runId: RunId): Promise<ModuleResult<Plan | null>>;
  history(runId: RunId): Promise<ModuleResult<readonly PlanRevision[]>>;
}
