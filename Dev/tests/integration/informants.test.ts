import { describe, it, expect } from 'vitest';
import { informants, type InformantState, type InformantInput } from '@domia/loop';
import { domiaError, moduleId } from '@domia/contracts';
import type { AriaSnapshot, DomiaError, Observation, Outcome, ToolOutput, ToolResultLine } from '@domia/contracts';

const meta = (durationMs: number) => ({ startedAt: '', endedAt: '', durationMs, traceId: 't' as never, spanId: 's' as never, artifacts: [] });
const ok = (durationMs = 10): Outcome<ToolOutput> => ({ status: 'ok', value: { value: {} }, meta: meta(durationMs), toJSON: () => ({}) });
const fail = (retryable: boolean): Outcome<ToolOutput> => ({ status: 'failed', error: { ...domiaError(moduleId('tools'), 'TOOL_FAILED', 'x', { retryable }) } as DomiaError, meta: meta(10), toJSON: () => ({}) });
const line = (outcome: Outcome<ToolOutput>): ToolResultLine => ({ callId: 'c' as never, name: 'browser.click', outcome });
const obs = (text: string, changed = true): Observation => ({ snapshot: { kind: 'aria', text } as AriaSnapshot, changedSinceLast: changed });
const fresh: InformantState = { failStreak: 0, noProgress: 0 };
const input = (p: Partial<InformantInput>): InformantInput => ({ results: [], stale: null, tokensUsed: 0, ...p });
const kinds = (r: ReturnType<typeof informants>) => r.signals.map((s) => s.kind);

describe('informants — advisory signals (never a stop)', () => {
  it('flags a slow action as a duration signal', () => {
    expect(kinds(informants(input({ results: [line(ok(9000))], observation: obs('a full page snapshot here') }), fresh))).toContain('duration');
  });

  it('advises retry on a transient (retryable) failure, not change-tactic', () => {
    const r = informants(input({ results: [line(fail(true))], observation: obs('content') }), fresh);
    expect(kinds(r)).toContain('transient');
    expect(r.state.failStreak).toBe(0);
  });

  it('escalates to change-tactic only after a streak of non-transient failures', () => {
    let state = fresh;
    let last = informants(input({ results: [line(fail(false))], observation: obs('content') }), state);
    for (let i = 0; i < 3; i++) { last = informants(input({ results: [line(fail(false))], observation: obs('content') }), state); state = last.state; }
    expect(last.state.failStreak).toBe(3);
    expect(kinds(last)).toContain('idle');
  });

  it('raises no_progress when the observation stops changing', () => {
    let state = fresh;
    let last = informants(input({ results: [line(ok())], observation: obs('same', false) }), state);
    for (let i = 0; i < 3; i++) { last = informants(input({ results: [line(ok())], observation: obs('same', false) }), state); state = last.state; }
    expect(last.state.noProgress).toBe(3);
    expect(kinds(last)).toContain('idle');
  });

  it('flags an almost-empty observation as not_ready', () => {
    expect(kinds(informants(input({ results: [line(ok())], observation: obs('...') }), fresh))).toContain('not_ready');
    expect(kinds(informants(input({ results: [line(ok())], observation: obs('a genuinely rendered page with real content') }), fresh))).not.toContain('not_ready');
  });

  it('raises context_pressure once token use crosses the threshold', () => {
    expect(kinds(informants(input({ observation: obs('content'), tokensUsed: 500_000 }), fresh))).toContain('context_pressure');
    expect(kinds(informants(input({ observation: obs('content'), tokensUsed: 1_000 }), fresh))).not.toContain('context_pressure');
  });

  it('honors custom thresholds (config-tunable, not hardcoded)', () => {
    const strict = { slowActionMs: 100, stuckTurns: 1, readyMinChars: 5, contextPressureTokens: 10 };
    expect(kinds(informants(input({ results: [line(ok(200))], observation: obs('plenty of content here') }), fresh, strict))).toContain('duration');
  });
});
