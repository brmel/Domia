import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EP, brandId } from '@domia/contracts';
import type { TargetSession, ToolOutput, Outcome } from '@domia/contracts';
import { bootTest, must, WEB_TARGET, type Harness, tmpDir } from './harness.js';

const call = (session: TargetSession, name: string, args: Record<string, unknown> = {}) =>
  session.invoke({ callId: brandId<'CallId'>(`c${Math.random().toString(36).slice(2, 8)}`), name, args });

/** Assert an invoke produced a successful Outcome (invoke returns Ok(Outcome.failed) for tool failures). */
function okValue(r: Awaited<ReturnType<typeof call>>): ToolOutput {
  const outcome: Outcome<ToolOutput> = must(r);
  if (outcome.status !== 'ok') throw new Error(`tool failed: ${outcome.error.code} ${outcome.error.message}`);
  return outcome.value;
}
function failedOutcome(r: Awaited<ReturnType<typeof call>>): { code: string; message: string } {
  const outcome: Outcome<ToolOutput> = must(r);
  if (outcome.status === 'ok') throw new Error('expected the tool to fail, but it succeeded');
  return { code: outcome.error.code, message: outcome.error.message };
}

describe('tools: real browser session + host providers', () => {
  let h: Harness;
  let session: TargetSession;
  let workdir: string;

  beforeAll(async () => {
    h = await bootTest();
    workdir = tmpDir('tools');
    session = must(await h.resolve(EP.ToolService).allocSession(WEB_TARGET, { workdir }));
  });
  afterAll(async () => { await session.dispose(); await h.dispose(); });

  it('composes one target driver plus host auxiliaries into a single toolset', () => {
    const names = session.manifests().map((m) => m.name);
    expect(names.filter((n) => n.startsWith('browser.')).length).toBeGreaterThan(20);
    expect(names).toContain('shell.exec');
    expect(names).toContain('fs.read');
    // MIL: the harness owns the session lifecycle, so the agent is never offered it.
    expect(names).not.toContain('browser.close');
  });

  it('observes the live page as an accessibility snapshot with refs', async () => {
    okValue(await call(session, 'browser.navigate', { url: 'https://example.com' }));
    const outcome = must(await session.observe());
    if (outcome.status !== 'ok') throw new Error('observe failed');
    expect(outcome.value.snapshot.text).toContain('ref=');
    expect(outcome.value.url).toContain('example.com');
  });

  it('acts by ref and carries the fresh observation on the result (D6)', async () => {
    // Tests share one session, so establish the page this test needs.
    okValue(await call(session, 'browser.navigate', { url: 'https://example.com' }));
    const before = must(await session.observe());
    if (before.status !== 'ok') throw new Error('observe failed');
    // Target the link by role, not by its copy — page wording changes, the
    // mechanism under test (act by ref) does not.
    // Refs are opaque tokens: plain (`e6`) or frame-qualified (`f1e6`) after a navigation.
    const linkLine = before.value.snapshot.text.split('\n').find((l) => /- link "/.test(l) && /\[ref=[^\]]+\]/.test(l));
    expect(linkLine, 'expected a link with a ref in the snapshot').toBeDefined();
    const ref = /\[ref=([^\]]+)\]/.exec(linkLine!)?.[1];
    expect(ref).toBeDefined();

    const out = okValue(await call(session, 'browser.click', { element: 'the outbound link', target: ref }));
    expect(out.observation, 'a state-changing tool must return the fresh observation').toBeDefined();
    expect(out.observation?.url).toContain('iana.org'); // the click actually navigated
  });

  it('reads and writes files inside the case workdir', async () => {
    okValue(await call(session, 'fs.write', { path: 'notes/hello.txt', content: 'domia' }));
    const read = okValue(await call(session, 'fs.read', { path: 'notes/hello.txt' }));
    expect((read.value as { content: string }).content).toBe('domia');
    const list = okValue(await call(session, 'fs.list', {}));
    expect(JSON.stringify(list.value)).toContain('notes');
  });

  it('blocks every path that escapes the sandbox', async () => {
    for (const path of ['../../../../etc/passwd', '/etc/passwd', 'notes/../../../etc/passwd']) {
      const err = failedOutcome(await call(session, 'fs.read', { path }));
      expect(err.code).toBe('INVALID_ARGS');
      expect(err.message).toContain('escapes');
    }
  });

  it('runs a shell command in the workdir and kills one that overruns', async () => {
    const ok = okValue(await call(session, 'shell.exec', { command: 'echo integration' }));
    expect((ok.value as { stdout: string }).stdout).toContain('integration');

    const slow = okValue(await call(session, 'shell.exec', { command: 'sleep 5', timeoutMs: 300 }));
    expect((slow.value as { timedOut: boolean }).timedOut).toBe(true);
  });

  it('refuses a tool no binding declares', async () => {
    const r = await call(session, 'nope.does_not_exist', {});
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.code).toBe('UNKNOWN_TOOL');
  });
});
