import type { Observation, ScopedConfig, Signal, ToolResultLine } from '@domia/contracts';

export interface InformantThresholds {
  readonly slowActionMs: number;
  readonly stuckTurns: number;
  readonly readyMinChars: number;
  readonly contextPressureTokens: number;
}
export const DEFAULT_THRESHOLDS: InformantThresholds = { slowActionMs: 8_000, stuckTurns: 3, readyMinChars: 40, contextPressureTokens: 400_000 };

export interface InformantState { readonly failStreak: number; readonly noProgress: number }
export interface InformantInput {
  readonly results: readonly ToolResultLine[];
  readonly observation?: Observation;
  readonly stale: Signal | null;
  readonly tokensUsed: number;
}
export interface InformantResult { readonly signals: readonly Signal[]; readonly state: InformantState }

/**
 * Advisory signals the loop folds into the agent's next input — never a veto. Pure:
 * (this turn's activity + prior counters) → signals + updated counters. Thresholds are
 * heuristics for *advice*, not limits on the agent, and are config-tunable.
 */
export function informants(inp: InformantInput, prev: InformantState, t: InformantThresholds = DEFAULT_THRESHOLDS): InformantResult {
  const { results, observation, stale } = inp;
  const signals: Signal[] = [];
  if (stale) signals.push(stale);

  // Adaptive timing: a slow action means the target is slow, not broken.
  const slowest = results.reduce((mx, r) => Math.max(mx, r.outcome.meta.durationMs), 0);
  if (slowest >= t.slowActionMs) signals.push({ kind: 'duration', message: `An action took ${(slowest / 1000).toFixed(1)}s — this target is slow. Give slow actions a larger timeoutMs and use wait tools; slowness is not failure. If the wait will be very long, suspend and resume later instead of blocking.` });

  // Transient (retryable) failure → retry; a streak of hard failures → change tactic.
  const failed = results.filter((r) => r.outcome.status !== 'ok');
  if (failed.some((r) => r.outcome.status !== 'ok' && r.outcome.error.retryable)) signals.push({ kind: 'transient', message: 'A tool failed with a transient error (network / timeout / rate limit). A retry usually succeeds — try the same action again before changing approach.' });
  const hardFail = failed.some((r) => r.outcome.status !== 'ok' && !r.outcome.error.retryable);
  const failStreak = hardFail ? prev.failStreak + 1 : 0;
  if (failStreak >= t.stuckTurns) signals.push({ kind: 'idle', message: `The last ${failStreak} turns produced non-transient failures. Step back and change approach — a different tool, element, or target, or ask the user.` });

  const noProgress = (observation?.changedSinceLast ?? true) ? 0 : prev.noProgress + 1;
  if (noProgress >= t.stuckTurns) signals.push({ kind: 'idle', message: `The observed state hasn't changed for ${noProgress} turns. Your actions may not be landing — re-observe and try a different element or approach.` });

  // Readiness: an almost-empty observation usually means still-loading or client-rendered.
  if (observation && observation.snapshot.text.trim().length < t.readyMinChars) signals.push({ kind: 'not_ready', message: 'The page has almost no readable content — it may still be loading or render client-side. Observe again (or wait) before concluding it is empty.' });

  // Context pressure: a long run risks losing early findings. Advise persisting them.
  if (inp.tokensUsed >= t.contextPressureTokens) signals.push({ kind: 'context_pressure', message: 'This run has used a lot of context. Persist key findings now (plan.note or memory.save) so they are not lost, keep responses concise, and consider finishing or suspending soon.' });

  return { signals, state: { failStreak, noProgress } };
}

/** Read informant thresholds from scoped config, falling back to the defaults. */
export function thresholdsFrom(config: ScopedConfig): InformantThresholds {
  return {
    slowActionMs: config.get('loop.informants.slowActionMs', DEFAULT_THRESHOLDS.slowActionMs),
    stuckTurns: config.get('loop.informants.stuckTurns', DEFAULT_THRESHOLDS.stuckTurns),
    readyMinChars: config.get('loop.informants.readyMinChars', DEFAULT_THRESHOLDS.readyMinChars),
    contextPressureTokens: config.get('loop.informants.contextPressureTokens', DEFAULT_THRESHOLDS.contextPressureTokens),
  };
}
