import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EP, brandId } from '@domia/contracts';
import type { TargetSession, ToolOutput, Outcome } from '@domia/contracts';
import { captureAuthState, authStatePath } from '@domia/case';
import { bootTest, must, WEB_TARGET, type Harness, tmpDir } from './harness.js';

const HAS_DISPLAY = process.platform !== 'linux' || Boolean(process.env['DISPLAY']);
const COOKIE = 'domia_f7=takeover';

const call = (session: TargetSession, name: string, args: Record<string, unknown> = {}) =>
  session.invoke({ callId: brandId<'CallId'>(`c${Math.random().toString(36).slice(2, 8)}`), name, args });

async function evaluate(session: TargetSession, fn: string): Promise<string> {
  const r = await call(session, 'browser.evaluate', { function: fn });
  const outcome: Outcome<ToolOutput> = must(r);
  if (outcome.status !== 'ok') throw new Error(`evaluate failed: ${outcome.error.message}`);
  const v = outcome.value.value;
  return typeof v === 'string' ? v : JSON.stringify(v);
}

describe('F7: headed flip + auth state', () => {
  let h: Harness;
  let session: TargetSession;

  beforeAll(async () => { h = await bootTest(); });
  afterAll(async () => { await session?.dispose(); await h.dispose(); });

  it('starts headless and exports the live auth state', async () => {
    session = must(await h.resolve(EP.ToolService).allocSession(WEB_TARGET, { record: { video: false, trace: false } }));
    expect(session.inspect().headed).toBe(false);
    await evaluate(session, `() => { document.cookie = '${COOKIE}; path=/'; return document.cookie; }`);
    const state = must(await session.exportAuthState());
    expect(JSON.parse(state)).toMatchObject({ cookies: expect.any(Array) });
    expect(state).toContain('domia_f7');
  });

  it.skipIf(!HAS_DISPLAY)('flips to a real window carrying the login and the page over', async () => {
    must(await session.setHeaded(true));
    expect(session.inspect().headed).toBe(true);

    const obs = must(await session.observe());
    if (obs.status !== 'ok') throw new Error('observe failed after the flip');
    expect(obs.value.url).toContain('example.com');
    expect(await evaluate(session, '() => document.cookie')).toContain('domia_f7');
  }, 90_000);

  it.skipIf(!HAS_DISPLAY)('flips back to headless and keeps driving', async () => {
    must(await session.setHeaded(false));
    expect(session.inspect().headed).toBe(false);
    const obs = must(await session.observe());
    if (obs.status !== 'ok') throw new Error('observe failed after flipping back');
    expect(obs.value.snapshot.text).toContain('ref=');
  }, 90_000);

  it('starts a fresh session already logged in from an auth state file', async () => {
    const state = must(await session.exportAuthState());
    const file = join(tmpDir('auth'), 'auth.json');
    writeFileSync(file, state, 'utf8');

    const seeded = must(await h.resolve(EP.ToolService).allocSession(WEB_TARGET, { authStateFile: file, record: { video: false, trace: false } }));
    try {
      expect(await evaluate(seeded, '() => document.cookie')).toContain('domia_f7');
    } finally {
      await seeded.dispose();
    }
  }, 90_000);

  it.skipIf(!HAS_DISPLAY)('captures a settled login into the case auth file, and says so when there is none', async () => {
    const svc = h.resolve(EP.CaseService);
    const tools = h.resolve(EP.ToolService);
    const c = must(await svc.create({ name: 'auth case', target: WEB_TARGET }));

    const empty = must(await captureAuthState(c, (t, o) => tools.allocSession(t, o), h.dataDir, 12_000));
    expect(empty.captured).toBe(false);
    expect(empty.notes.join(' ')).toContain('no settled login');

    const state = must(await session.exportAuthState());
    const file = join(tmpDir('seed'), 'auth.json');
    writeFileSync(file, state, 'utf8');
    const seeded = must(await captureAuthState(c, (t, o) => tools.allocSession(t, { ...o, authStateFile: file }), h.dataDir, 40_000));
    expect(seeded.captured).toBe(true);
    expect(readFileSync(authStatePath(h.dataDir, c.id), 'utf8')).toContain('domia_f7');
  }, 120_000);

  it('refuses to flip a target that has no display of its own', async () => {
    const shell = must(await h.resolve(EP.ToolService).allocSession({ kind: 'web', url: 'https://example.com' }, { driver: 'fetch-scrape' }));
    try {
      const r = await shell.setHeaded(true);
      expect(r.isErr()).toBe(true);
      if (r.isErr()) expect(r.error.code).toBe('BAD_CONFIG');
    } finally {
      await shell.dispose();
    }
  });
});
