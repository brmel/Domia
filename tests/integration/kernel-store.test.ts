import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EP, brandId } from '@domia/contracts';
import type { CaseId, RunId } from '@domia/contracts';
import { bootTest, must, makeCase, type Harness } from './harness.js';

describe('kernel + store (real modules, real SQLite)', () => {
  let h: Harness;
  beforeAll(async () => { h = await bootTest(); });
  afterAll(async () => { await h.dispose(); });

  it('loads every module and exposes its extension point', () => {
    // Resolution failure throws in `resolve` — this asserts the whole wiring map.
    for (const point of [EP.Tracer, EP.Store, EP.ToolService, EP.AgentService, EP.CaseService, EP.PlanService, EP.MemoryService, EP.LoopEngine]) {
      expect(h.resolve(point)).toBeTruthy();
    }
  });

  it('reports a missing extension point instead of returning undefined', () => {
    const bogus = { id: 'not.registered', arity: 'one' as const };
    const r = h.kernel.resolve(bogus);
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.code).toBe('EXTENSION_MISSING');
  });

  it('round-trips a case through SQLite', async () => {
    const caseId = await makeCase(h, 'Round trip');
    const got = must(await h.resolve(EP.CaseService).get(caseId));
    expect(got?.name).toBe('Round trip');
    expect(got?.target).toEqual({ kind: 'web', url: 'https://example.com' });
  });

  it('persists runs and lists them newest-first', async () => {
    const store = h.resolve(EP.Store);
    const caseId = await makeCase(h, 'Runs');
    const mk = (id: string, request: string) => ({
      id: brandId<'RunId'>(id) as RunId, caseId, persona: 'lead', status: 'ok' as const,
      request, options: {}, startedAt: new Date().toISOString(),
    });
    must(await store.runs.insert(mk('runAAA', 'first')));
    must(await store.runs.insert(mk('runBBB', 'second')));

    const listed = must(await store.runs.list({ limit: 10 }));
    expect(listed.rows.map((r) => r.request)).toContain('first');
    expect(listed.rows.map((r) => r.request)).toContain('second');

    const one = must(await store.runs.get(brandId<'RunId'>('runAAA') as RunId));
    expect(one?.request).toBe('first');
  });

  it('keeps the exchange tape append-only and ordered (the replay source)', async () => {
    const store = h.resolve(EP.Store);
    const caseId = await makeCase(h, 'Tape');
    const runId = brandId<'RunId'>('runTape') as RunId;
    must(await store.runs.insert({ id: runId, caseId, persona: 'lead', status: 'ok', request: 'tape', options: {}, startedAt: new Date().toISOString() }));

    for (let seq = 0; seq < 3; seq++) {
      must(await store.exchanges.append({ runId, seq, direction: seq % 2 === 0 ? 'agent' : 'tool', payload: { seq }, at: new Date().toISOString() }));
    }
    const tape = must(await store.exchanges.listByRun(runId));
    expect(tape.map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(tape[0]?.direction).toBe('agent');
  });

  it('rejects a run whose case does not exist (FK enforced)', async () => {
    const store = h.resolve(EP.Store);
    const r = await store.runs.insert({
      id: brandId<'RunId'>('orphan') as RunId, caseId: brandId<'CaseId'>('nope') as CaseId,
      persona: 'lead', status: 'ok', request: 'orphan', options: {}, startedAt: new Date().toISOString(),
    });
    expect(r.isErr()).toBe(true);
  });
});
