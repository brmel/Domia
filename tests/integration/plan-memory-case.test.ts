import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EP, brandId } from '@domia/contracts';
import type { ItemId, RunId } from '@domia/contracts';
import { bootTest, must, makeCase, type Harness } from './harness.js';

describe('plan / memory / case contexts (MIL alloc → use → free)', () => {
  let h: Harness;
  beforeAll(async () => { h = await bootTest(); });
  afterAll(async () => { await h.dispose(); });

  it('drives a plan through its lifecycle and persists every revision', async () => {
    const store = h.resolve(EP.Store);
    const caseId = await makeCase(h, 'Plan case');
    const runId = brandId<'RunId'>('planRun') as RunId;
    must(await store.runs.insert({ id: runId, caseId, persona: 'lead', status: 'running', request: 'plan test', options: {}, startedAt: new Date().toISOString() }));

    const plan = must(await h.resolve(EP.PlanService).allocContext(runId, 'do the thing'));

    must(await plan.apply({ op: 'propose', items: [{ title: 'A', intent: 'do a' }, { title: 'B', intent: 'do b' }] }, 'agent'));
    expect(plan.current().items).toHaveLength(2);
    expect(plan.current().status).toBe('active');

    const first = plan.current().items[0]!.id;
    must(await plan.apply({ op: 'start', itemId: first }, 'agent'));
    expect(plan.current().items[0]!.status).toBe('active');

    must(await plan.apply({ op: 'complete', itemId: first, note: 'evidence' }, 'agent'));
    expect(plan.current().items[0]!.status).toBe('done');
    expect(plan.current().items[0]!.note).toBe('evidence');

    // Survives the context: the plan is rows, not memory.
    const reloaded = must(await h.resolve(EP.PlanService).get(runId));
    expect(reloaded?.items).toHaveLength(2);
    expect(reloaded?.items[0]?.status).toBe('done');

    const history = must(await h.resolve(EP.PlanService).history(runId));
    expect(history.length).toBeGreaterThanOrEqual(3); // propose, start, complete
    await plan.dispose();
  });

  it('rejects an unknown plan item rather than corrupting the plan', async () => {
    const store = h.resolve(EP.Store);
    const caseId = await makeCase(h, 'Plan guard');
    const runId = brandId<'RunId'>('planGuard') as RunId;
    must(await store.runs.insert({ id: runId, caseId, persona: 'lead', status: 'running', request: 'x', options: {}, startedAt: new Date().toISOString() }));
    const plan = must(await h.resolve(EP.PlanService).allocContext(runId, 'goal'));

    must(await plan.apply({ op: 'propose', items: [{ title: 'only', intent: 'one' }] }, 'agent'));
    const before = plan.current().items.length;
    // Completing a nonexistent item must not add or drop items.
    must(await plan.apply({ op: 'complete', itemId: brandId<'ItemId'>('ghost') as ItemId }, 'agent'));
    expect(plan.current().items).toHaveLength(before);
    await plan.dispose();
  });

  it('raises a plan_stale informant after an active plan goes untouched, and resets on change', async () => {
    const store = h.resolve(EP.Store);
    const caseId = await makeCase(h, 'Plan staleness');
    const runId = brandId<'RunId'>('planStale') as RunId;
    must(await store.runs.insert({ id: runId, caseId, persona: 'lead', status: 'running', request: 'x', options: {}, startedAt: new Date().toISOString() }));
    const plan = must(await h.resolve(EP.PlanService).allocContext(runId, 'goal'));
    must(plan.configure({ staleAfterTurns: 3 }));

    // No plan yet (status empty) → never stale; the plan is optional, never forced.
    expect(plan.staleness()).toBeNull();

    must(await plan.apply({ op: 'propose', items: [{ title: 'A', intent: 'do a' }] }, 'agent'));
    const first = plan.current().items[0]!.id;
    must(await plan.apply({ op: 'start', itemId: first }, 'agent'));

    // Poll (once per turn). Below threshold → quiet.
    expect(plan.staleness()).toBeNull();
    expect(plan.staleness()).toBeNull();
    const fired = plan.staleness();
    expect(fired?.kind).toBe('plan_stale');
    expect(fired?.message).toContain('A');

    // Touching the plan clears the informant — it's advisory, not a latch.
    must(await plan.apply({ op: 'complete', itemId: first, note: 'done' }, 'agent'));
    // Plan now settled (all items done) → no staleness regardless of polls.
    expect(plan.current().status).toBe('settled');
    expect(plan.staleness()).toBeNull();
    await plan.dispose();
  });

  it('injects only memories relevant to the request', async () => {
    const memory = h.resolve(EP.MemoryService);
    const caseId = await makeCase(h, 'Memory case');

    must(await memory.dispatch(caseId, { callId: brandId<'CallId'>('m1'), name: 'memory.save', args: { title: 'Login quirk', text: 'login button is in a shadow DOM', tags: ['login'] } }));
    must(await memory.dispatch(caseId, { callId: brandId<'CallId'>('m2'), name: 'memory.save', args: { title: 'Export format', text: 'exports are CSV only', tags: ['export'] } }));

    const forLogin = must(await memory.relevant(caseId, 'sign in using the login form'));
    expect(forLogin.map((m) => m.title)).toEqual(['Login quirk']);

    const forExport = must(await memory.relevant(caseId, 'export the report'));
    expect(forExport.map((m) => m.title)).toEqual(['Export format']);

    const unrelated = must(await memory.relevant(caseId, 'completely different subject matter'));
    expect(unrelated).toHaveLength(0);
  });

  it('round-trips a memory body without its markdown heading', async () => {
    const memory = h.resolve(EP.MemoryService);
    const caseId = await makeCase(h, 'Body case');
    must(await memory.dispatch(caseId, { callId: brandId<'CallId'>('m3'), name: 'memory.save', args: { title: 'Title Here', text: 'just the body' } }));
    const [card] = must(await memory.relevant(caseId, 'Title Here'));
    expect(card?.body).toBe('just the body');
  });

  it('allocates a case context with a sandbox workdir and frees it', async () => {
    const caseId = await makeCase(h, 'Ctx case');
    const ctx = must(await h.resolve(EP.CaseService).allocContext(caseId));
    expect(ctx.workdir).toContain(h.dataDir);
    expect(ctx.resolvedTarget).toEqual({ kind: 'web', url: 'https://example.com' });

    const { existsSync } = await import('node:fs');
    expect(existsSync(ctx.workdir)).toBe(true);
    await ctx.dispose();
    expect(existsSync(ctx.workdir)).toBe(false); // MIL free: the workdir goes with it
  });
});
