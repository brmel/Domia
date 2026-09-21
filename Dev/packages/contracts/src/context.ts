import type { ModuleResult } from './errors.js';
import type { ContextId } from './ids.js';

/** MIL Alloc/Control/Inquire/Free. configure/inspect sync; dispose async idempotent. */
export interface Context<TConfig, TState = Record<string, never>> {
  readonly id: ContextId;
  configure(patch: Partial<TConfig>): ModuleResult<void>;
  inspect(): Readonly<TConfig & TState>;
  dispose(): Promise<void>;
}

export interface ContextFactory<TConfig, TCtx extends Context<TConfig, Record<string, unknown>> | Context<TConfig>> {
  alloc(config: TConfig): Promise<ModuleResult<TCtx>>;
}

/** Cooperative; checked between turns/calls, never mid-write. */
export type CancelSignal = AbortSignal;
