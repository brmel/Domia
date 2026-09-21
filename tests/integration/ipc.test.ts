import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { bootHeadless, createApiRouter, type ApiRouter } from '@domia/hosts';
import { createApi } from '@domia/api';
import type { AgentTurn, ApiResult, Case } from '@domia/contracts';
import type { Kernel } from '@domia/kernel';
import { must, tmpDir } from './harness.js';

const SCRIPT: AgentTurn[] = [{ kind: 'final', summary: 'routed over IPC', verdict: 'pass' }];
const ok = <T>(r: ApiResult<T>): T => { if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`); return r.data; };

describe('IPC router: DomiaApi over a transport-agnostic seam', () => {
  let kernel: Kernel;
  let dataDir: string;
  let router: ApiRouter;

  beforeAll(async () => {
    dataDir = tmpDir('ipc');
    kernel = must(await bootHeadless({
      dataDir, artifactsDir: join(dataDir, 'artifacts'), dbPath: join(dataDir, 'domia.db'), logLevel: 'error',
      agent: { replay: () => SCRIPT },
    })).kernel;
    router = createApiRouter(createApi(kernel, false));
  });
  afterAll(async () => { await kernel.shutdown(); rmSync(dataDir, { recursive: true, force: true }); });

  it('routes invoke calls to the facade and returns wire-safe ApiResults', async () => {
    const created = ok(await router.invoke('cases.create', [{ name: 'ipc case', target: { kind: 'web', url: 'https://example.com' } }]) as ApiResult<Case>);
    const got = ok(await router.invoke('cases.get', [created.id]) as ApiResult<Case>);
    expect(got.name).toBe('ipc case');
    const providers = ok(await router.invoke('agents.providers', []) as ApiResult<{ id: string }[]>);
    expect(providers.some((p) => p.id === 'replay')).toBe(true);
  });

  it('refuses any path not on the allowlist (no arbitrary method access)', async () => {
    const r = await router.invoke('cases.dropTable', ['x']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('NOT_FOUND');
    const w = router.watch('kernel.shutdown', [], () => undefined, new AbortController().signal);
    expect(w.ok).toBe(false);
  });

  it('streams a live run over the watch channel, sync-first through to terminal', async () => {
    const created = ok(await router.invoke('cases.create', [{ name: 'watch case', target: { kind: 'web', url: 'https://example.com' } }]) as ApiResult<Case>);
    const runId = ok(await router.invoke('runs.start', [created.id, 'go', { personaOverrides: { lead: { model: { provider: 'replay', model: 'scripted' } } } }]) as ApiResult<string>);

    const events: { type: string }[] = [];
    const done = new Promise<void>((resolve) => {
      const started = router.watch('runs.watch', [runId], (e) => {
        const ev = e as { type: string };
        events.push(ev);
        if (ev.type === 'terminal') resolve();
      }, new AbortController().signal);
      expect(started.ok).toBe(true);
    });
    await done;
    expect(events[0]?.type).toBe('sync');
    expect(events.at(-1)?.type).toBe('terminal');
  }, 60_000);
});
