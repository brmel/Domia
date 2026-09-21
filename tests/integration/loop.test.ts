import { describe, it, expect, afterEach } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { bootHeadless, startRun, replayRun } from '@domia/hosts';
import { EP, brandId } from '@domia/contracts';
import type { AgentTurn, CaseId, ModelRef, RunEvent } from '@domia/contracts';
import type { Kernel } from '@domia/kernel';
import { must, tmpDir } from './harness.js';

const REPLAY: ModelRef = { provider: 'replay', model: 'scripted' };

/**
 * The whole stack runs for real — browser, tools, plan, store, trace — with only
 * the model replaced by scripted turns. Deterministic, free, and it exercises the
 * same code path a live run takes.
 */
async function bootWithScript(turns: readonly AgentTurn[]): Promise<{ kernel: Kernel; dataDir: string; caseId: CaseId }> {
  const dataDir = tmpDir('loop');
  const booted = await bootHeadless({
    dataDir, artifactsDir: join(dataDir, 'artifacts'), dbPath: join(dataDir, 'domia.db'), logLevel: 'error',
    values: { 'tools.record.video': true },
    agent: { replay: () => turns },
  });
  const { kernel } = must(booted);
  const created = must(await kernel.resolve(EP.CaseService)._unsafeUnwrap().create({
    name: 'loop case', target: { kind: 'web', url: 'https://example.com' },
  }));
  return { kernel, dataDir, caseId: created.id };
}

let cleanup: (() => Promise<void>) | null = null;
afterEach(async () => { await cleanup?.(); cleanup = null; });

describe('the loop: full run, real stack, scripted model', () => {
  it('plans, acts on the page, and finishes — persisting run, plan, tape and artifacts', async () => {
    const script: AgentTurn[] = [
      { kind: 'act', calls: [{ name: 'plan.propose', args: { items: [{ title: 'Read title', intent: 'know the page title' }] } }] },
      { kind: 'act', calls: [{ name: 'browser.snapshot', args: {} }] },
      { kind: 'act', calls: [{ name: 'plan.complete_item', args: { itemId: 'WILL_BE_REPLACED', note: 'saw it' } }] },
      { kind: 'final', summary: 'The page title is Example Domain.', verdict: 'pass' },
    ];
    const { kernel, dataDir, caseId } = await bootWithScript(script);
    cleanup = async () => { await kernel.shutdown(); rmSync(dataDir, { recursive: true, force: true }); };

    const events: RunEvent[] = [];
    const started = must(await startRun(kernel, {
      caseId, request: 'Report the page title', model: REPLAY, maxTurns: 10,
      onEvent: (e) => events.push(e),
    }));

    // Outcome
    expect(started.outcome.status).toBe('ok');
    if (started.outcome.status !== 'ok') throw new Error('run failed');
    expect(started.outcome.value.summary).toContain('Example Domain');
    expect(started.outcome.value.verdict).toBe('pass');
    expect(started.outcome.value.stats.turns).toBe(4);

    // Live events reached the caller
    expect(events.filter((e) => e.type === 'turn')).toHaveLength(4);
    expect(events.some((e) => e.type === 'plan')).toBe(true);
    expect(events.some((e) => e.type === 'terminal')).toBe(true);

    const store = kernel.resolve(EP.Store)._unsafeUnwrap();

    // Run row terminalized
    const row = must(await store.runs.get(started.runId));
    expect(row?.status).toBe('ok');
    expect(row?.endedAt).toBeDefined();

    // Plan persisted with the agent's item
    const plan = must(await kernel.resolve(EP.PlanService)._unsafeUnwrap().get(started.runId));
    expect(plan?.items.map((i) => i.title)).toEqual(['Read title']);

    // The exchange tape (replay source) recorded every turn and call, in order
    const tape = must(await store.exchanges.listByRun(started.runId));
    expect(tape.filter((e) => e.direction === 'agent')).toHaveLength(4);
    expect(tape.filter((e) => e.direction === 'tool').length).toBeGreaterThanOrEqual(3);
    expect(tape.map((e) => e.seq)).toEqual([...tape.map((_, i) => i)]);

    // Devtools capture landed and is tied to this run
    const artifacts = must(await store.artifacts.byRun(started.runId));
    expect(artifacts.some((a) => a.kind === 'video')).toBe(true);
    expect(artifacts.every((a) => a.sha256.length === 64)).toBe(true);

    // The run→tool span tree is one trace, rooted at `run`
    const spans = must(await store.traces.spansByRun(started.runId));
    expect(new Set(spans.map((s) => s.traceId)).size).toBe(1);
    const root = spans.find((s) => s.name === 'run');
    expect(root?.parentSpanId).toBeUndefined();
    expect(spans.filter((s) => s.parentSpanId === root?.spanId).length).toBeGreaterThan(1);
  });

  it('stops at the turn ceiling instead of looping forever', async () => {
    // A model that never finishes: the harness must stop it.
    const forever: AgentTurn = { kind: 'act', calls: [{ name: 'browser.snapshot', args: {} }] };
    const { kernel, dataDir, caseId } = await bootWithScript(Array.from({ length: 20 }, () => forever));
    cleanup = async () => { await kernel.shutdown(); rmSync(dataDir, { recursive: true, force: true }); };

    const started = must(await startRun(kernel, { caseId, request: 'never ends', model: REPLAY, maxTurns: 3 }));
    expect(started.outcome.status).toBe('failed');
    if (started.outcome.status === 'ok') throw new Error('expected failure');
    expect(started.outcome.error.message).toContain('max turns');

    const row = must(await kernel.resolve(EP.Store)._unsafeUnwrap().runs.get(started.runId));
    expect(row?.status).toBe('failed');
  });

  it('feeds a failed tool back to the agent instead of aborting the run', async () => {
    const script: AgentTurn[] = [
      { kind: 'act', calls: [{ name: 'fs.read', args: { path: '../../../../etc/passwd' } }] }, // sandbox blocks this
      { kind: 'final', summary: 'recovered after the blocked read' },
    ];
    const { kernel, dataDir, caseId } = await bootWithScript(script);
    cleanup = async () => { await kernel.shutdown(); rmSync(dataDir, { recursive: true, force: true }); };

    const started = must(await startRun(kernel, { caseId, request: 'try a blocked path', model: REPLAY, maxTurns: 5 }));
    expect(started.outcome.status).toBe('ok'); // a failed tool is data, not a crash
    const tape = must(await kernel.resolve(EP.Store)._unsafeUnwrap().exchanges.listByRun(started.runId));
    const toolEntry = tape.find((e) => e.direction === 'tool');
    expect(JSON.stringify(toolEntry?.payload)).toContain('failed');
  });

  it('spawns a child run and awaits its report (parallel lanes, one case)', async () => {
    // Parent context allocates before the child, so an ordered queue scripts each.
    const parent: AgentTurn[] = [
      { kind: 'act', calls: [{ name: 'agent.spawn', args: { request: 'do the child task' } }] },
      { kind: 'act', calls: [{ name: 'agent.await', args: {} }] },
      { kind: 'final', summary: 'parent done after child', verdict: 'pass' },
    ];
    const child: AgentTurn[] = [{ kind: 'final', summary: 'child done', verdict: 'pass' }];
    const queue: AgentTurn[][] = [parent, child];

    const dataDir = tmpDir('loop');
    const booted = must(await bootHeadless({
      dataDir, artifactsDir: join(dataDir, 'artifacts'), dbPath: join(dataDir, 'domia.db'), logLevel: 'error',
      agent: { replay: () => queue.shift() ?? [] },
    }));
    const { kernel } = booted;
    cleanup = async () => { await kernel.shutdown(); rmSync(dataDir, { recursive: true, force: true }); };
    const caseId = must(await kernel.resolve(EP.CaseService)._unsafeUnwrap().create({
      name: 'spawn case', target: { kind: 'web', url: 'https://example.com' },
    })).id;

    const events: RunEvent[] = [];
    const started = must(await startRun(kernel, { caseId, request: 'delegate to a child', model: REPLAY, maxTurns: 10, onEvent: (e) => events.push(e) }));

    expect(started.outcome.status).toBe('ok');
    if (started.outcome.status !== 'ok') throw new Error('run failed');
    expect(started.outcome.value.summary).toContain('parent done');

    const spawned = events.find((e) => e.type === 'spawned');
    expect(spawned, 'a spawned event should reach subscribers').toBeDefined();
    if (spawned?.type !== 'spawned') throw new Error('no spawned event');

    const store = kernel.resolve(EP.Store)._unsafeUnwrap();
    // Parent recorded both belt calls, and agent.await succeeded (joined the child).
    const tape = must(await store.exchanges.listByRun(started.runId));
    const calls = tape.filter((e) => e.direction === 'tool').map((e) => (e.payload as { name: string; status: string }));
    expect(calls).toEqual([
      { name: 'agent.spawn', args: expect.anything(), status: 'ok' },
      { name: 'agent.await', args: expect.anything(), status: 'ok' },
    ]);

    // The child ran its own script to completion in its own lane and terminalized ok.
    const childRow = must(await store.runs.get(spawned.childRunId));
    expect(childRow?.status).toBe('ok');
    expect(childRow?.parentRunId).toBe(started.runId);

    // The parent→child link is queryable for the run tree.
    const kids = must(await store.runs.children(started.runId));
    expect(kids.map((k) => k.id)).toContain(spawned.childRunId);
  }, 60_000);

  it('replays a past run from its recorded exchange tape', async () => {
    const dataDir = tmpDir('replay');
    const dirs = { dataDir, artifactsDir: join(dataDir, 'artifacts'), dbPath: join(dataDir, 'domia.db'), logLevel: 'error' as const };
    const script: AgentTurn[] = [
      { kind: 'act', calls: [{ name: 'browser.snapshot', args: {} }] },
      { kind: 'final', summary: 'The recorded run saw the page.', verdict: 'pass' },
    ];

    // Record a run, then release the DB so the replay boot owns it cleanly.
    const booted = must(await bootHeadless({ ...dirs, agent: { replay: () => script } }));
    const caseId = must(await booted.kernel.resolve(EP.CaseService)._unsafeUnwrap().create({
      name: 'replay case', target: { kind: 'web', url: 'https://example.com' },
    })).id;
    const first = must(await startRun(booted.kernel, { caseId, request: 'observe the page', model: REPLAY, maxTurns: 10 }));
    expect(first.outcome.status).toBe('ok');
    await booted.kernel.shutdown();

    // Replay drives the same case/request through the recorded turns.
    const events: RunEvent[] = [];
    const replayed = must(await replayRun(first.runId, { ...dirs, onEvent: (e) => events.push(e) }));
    cleanup = async () => { rmSync(dataDir, { recursive: true, force: true }); };

    expect(replayed.outcome.status).toBe('ok');
    if (replayed.outcome.status !== 'ok' || first.outcome.status !== 'ok') throw new Error('replay failed');
    expect(replayed.outcome.value.summary).toBe(first.outcome.value.summary);
    expect(replayed.runId).not.toBe(first.runId); // a fresh run, same decisions
    expect(events.filter((e) => e.type === 'turn')).toHaveLength(2);
  }, 60_000);

  it('context.handoff parks an unattended run by degrading to suspend (D12/R2)', async () => {
    const script: AgentTurn[] = [
      { kind: 'act', calls: [{ name: 'context.handoff', args: { reason: 'please solve the captcha' } }] },
      { kind: 'final', summary: 'should not be reached' },
    ];
    const { kernel, dataDir, caseId } = await bootWithScript(script);
    cleanup = async () => { await kernel.shutdown(); rmSync(dataDir, { recursive: true, force: true }); };

    // interactive:false → no human attached → handoff can't wait, so the run suspends.
    const started = must(await startRun(kernel, { caseId, request: 'needs a human', model: REPLAY, maxTurns: 5, runOptions: { interactive: false } }));
    expect(started.outcome.status).toBe('suspended');

    const row = must(await kernel.resolve(EP.Store)._unsafeUnwrap().runs.get(started.runId));
    expect(row?.status).toBe('suspended');
  });

  it('routes an unknown tool to a failed outcome the agent can react to', async () => {
    const script: AgentTurn[] = [
      { kind: 'act', calls: [{ name: 'totally.unknown', args: {} }] },
      { kind: 'final', summary: 'moved on' },
    ];
    const { kernel, dataDir, caseId } = await bootWithScript(script);
    cleanup = async () => { await kernel.shutdown(); rmSync(dataDir, { recursive: true, force: true }); };

    const started = must(await startRun(kernel, { caseId, request: 'unknown tool', model: REPLAY, maxTurns: 5 }));
    expect(started.outcome.status).toBe('ok');
  });
});
