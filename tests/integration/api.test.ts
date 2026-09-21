import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { bootHeadless } from '@domia/hosts';
import { createApi, createScheduler, computeNext } from '@domia/api';
import { EP } from '@domia/contracts';
import type { AgentTurn, CaseId, DomiaApi, RunEvent, RunId } from '@domia/contracts';
import type { Kernel } from '@domia/kernel';
import { must, mustApi, tmpDir } from './harness.js';

const REPLAY = { provider: 'replay', model: 'scripted' } as const;
const SCRIPT: AgentTurn[] = [
  { kind: 'act', calls: [{ name: 'browser.snapshot', args: {} }] },
  { kind: 'final', summary: 'The facade drove a full run.', verdict: 'pass' },
];

describe('@domia/api: the one facade UI/CLI/mcp consume', () => {
  let kernel: Kernel;
  let dataDir: string;
  let api: DomiaApi;

  beforeAll(async () => {
    dataDir = tmpDir('api');
    const booted = must(await bootHeadless({
      dataDir, artifactsDir: join(dataDir, 'artifacts'), dbPath: join(dataDir, 'domia.db'), logLevel: 'error',
      agent: { replay: () => SCRIPT },
    }));
    kernel = booted.kernel;
    api = createApi(kernel);
  });
  afterAll(async () => { await kernel.shutdown(); rmSync(dataDir, { recursive: true, force: true }); });

  it('creates and reads a case through the facade (wire-safe ApiResult)', async () => {
    const created = await api.cases.create({ name: 'api case', target: { kind: 'web', url: 'https://example.com' } });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.error.message);
    const got = await api.cases.get(created.data.id);
    expect(got.ok && got.data.name).toBe('api case');
    const missing = await api.cases.get('nope' as CaseId);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe('NOT_FOUND');
  });

  it('starts a run in the background, streams it sync-first, and terminalizes it', async () => {
    const created = await api.cases.create({ name: 'run case', target: { kind: 'web', url: 'https://example.com' } });
    if (!created.ok) throw new Error('case create failed');
    const started = await api.runs.start(created.data.id, 'drive it', { personaOverrides: { lead: { model: REPLAY } } });
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error(started.error.message);
    const runId = started.data;

    // F5 — the first event is a full snapshot, then live events, ending at terminal.
    // The events are the live truth (they carry the report); the store row settles just after.
    const events: RunEvent[] = [];
    for await (const e of api.runs.watch(runId)) { events.push(e); if (e.type === 'terminal') break; }
    expect(events[0]?.type).toBe('sync');
    expect(events.some((e) => e.type === 'turn')).toBe(true);
    const terminal = events.at(-1);
    expect(terminal?.type).toBe('terminal');
    if (terminal?.type === 'terminal') expect(terminal.status).toBe('ok');

    // The dead run's record eventually reflects terminal; control now reports RUN_NOT_LIVE.
    const view = await pollUntil(() => api.runs.get(runId), (v) => v.ok && v.data.status !== 'running');
    expect(view.ok && view.data.status).toBe('ok');
    const paused = await api.runs.pause(runId);
    expect(paused.ok).toBe(false);
    if (!paused.ok) expect(paused.error.code).toBe('RUN_NOT_LIVE');

    const plan = await api.plans.get(runId);
    expect(plan.ok).toBe(true);
    const timeline = await api.traces.timeline(runId);
    expect(timeline.ok && timeline.data.length).toBeGreaterThan(0);
  }, 60_000);

  it('exposes tool catalog, agent providers, and round-trips settings', async () => {
    // Playwright discovers its tools only once connected (D18); the browserless
    // fetch driver and host auxiliaries list statically, so the catalog shows them.
    const cat = await api.tools.catalog({ kind: 'web', url: 'https://example.com' });
    expect(cat.ok && cat.data.some((m) => m.name === 'fetch.get')).toBe(true);

    const provs = await api.agents.providers();
    expect(provs.ok && provs.data.some((p) => p.id === 'replay')).toBe(true);

    mustApi(await api.settings.patch({ theme: 'dark' }));
    const s = await api.settings.get();
    expect(s.ok && s.data['theme']).toBe('dark');
  });

  it('memories: save, list, and remove through the facade', async () => {
    const created = await api.cases.create({ name: 'mem case', target: { kind: 'web', url: 'https://example.com' } });
    if (!created.ok) throw new Error('case create failed');
    mustApi(await api.memories.save(created.data.id, { title: 'Login path', body: 'Sign in at /signin', tags: ['auth'] }));

    const list = mustApi(await api.memories.list(created.data.id));
    const card = list.find((m) => m.title === 'Login path');
    expect(card).toBeDefined();

    mustApi(await api.memories.remove(card!.id));
    const after = mustApi(await api.memories.list(created.data.id));
    expect(after.some((m) => m.id === card!.id)).toBe(false);
  });

  it('skills: list is available and an unknown skill is NOT_FOUND', async () => {
    const list = await api.skills.list();
    expect(list.ok).toBe(true);
    const missing = await api.skills.get('does-not-exist-skill');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe('NOT_FOUND');
  });

  it('R5 — a cron schedule fires a run when its nextAt passes, then advances', async () => {
    const created = await api.cases.create({ name: 'sched case', target: { kind: 'web', url: 'https://example.com' } });
    if (!created.ok) throw new Error('case create failed');

    const scheduler = createScheduler(kernel);
    const sched = must(await scheduler.create({ caseId: created.data.id, cron: '@every 1h', request: 'scheduled work', options: { personaOverrides: { lead: { model: REPLAY } } } }));
    expect(sched.nextAt).toBeDefined();

    // Nothing is due yet.
    expect(must(await scheduler.tick(new Date())).length).toBe(0);

    // Jump past nextAt: exactly one run fires and the schedule rolls forward.
    const later = new Date(Date.parse(sched.nextAt!) + 1000);
    const fired = must(await scheduler.tick(later));
    expect(fired).toHaveLength(1);

    const store = kernel.resolve(EP.Store)._unsafeUnwrap();
    const row = must(await store.runs.get(fired[0]!));
    expect(row?.caseId).toBe(created.data.id);
    expect(row?.options.interactive).toBe(false); // unattended (D12)

    const rolled = must(await store.schedules.listEnabled()).find((x) => x.id === sched.id);
    expect(rolled?.lastRunId).toBe(fired[0]);
    expect(Date.parse(rolled!.nextAt!)).toBeGreaterThan(Date.parse(sched.nextAt!));
  }, 60_000);
});

it('computeNext supports @every, @hourly, @daily and rejects the rest', () => {
  const base = new Date('2026-07-20T10:30:00.000Z');
  expect(computeNext('@every 5m', base)).toBe('2026-07-20T10:35:00.000Z');
  expect(computeNext('@every 2h', base)).toBe('2026-07-20T12:30:00.000Z');
  expect(computeNext('@hourly', base)).toBe('2026-07-20T11:00:00.000Z');
  expect(computeNext('@daily', base)).toBe('2026-07-21T00:00:00.000Z');
  expect(computeNext('*/5 * * * *', base)).toBeNull();
});

async function pollUntil<T>(get: () => Promise<T>, done: (v: T) => boolean, tries = 50): Promise<T> {
  let v = await get();
  for (let i = 0; i < tries && !done(v); i++) { await new Promise((r) => setTimeout(r, 20)); v = await get(); }
  return v;
}
