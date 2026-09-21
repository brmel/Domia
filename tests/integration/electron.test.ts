import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { EP, brandId } from '@domia/contracts';
import type { TargetSession, TargetSpec, ToolOutput, Outcome } from '@domia/contracts';
import { bootTest, must, type Harness } from './harness.js';

/** The electron binary ships as a devDependency; skip cleanly where it is absent. */
function electronBinary(): string | null {
  try {
    const req = createRequire(import.meta.url);
    const bin = req('electron') as unknown;
    return typeof bin === 'string' && existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
}

/**
 * Launching a real Electron window does not work on the CI runner: the app
 * starts, never opens its remote-debugging port, and exits 0. Unresolved, so the
 * one test that needs a live window is skipped there. The rest of the file -
 * both failure paths - runs everywhere.
 */
const CI = Boolean(process.env.CI);

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'electron-app');
const binary = electronBinary();

describe.skipIf(!binary)('electron target (real app over CDP)', () => {
  let h: Harness;
  let session: TargetSession | null = null;

  afterEach(async () => {
    await session?.dispose();
    session = null;
    await h?.dispose();
  });

  it.skipIf(CI)('launches the app, attaches over CDP, and drives its real DOM', async () => {
    h = await bootTest();
    // Electron is launched via its binary with the fixture app as its argument.
    const target: TargetSpec = { kind: 'electron', appPath: binary!, args: [FIXTURE] };
    session = must(await h.resolve(EP.ToolService).allocSession(target, {}));

    const names = session.manifests().map((m) => m.name);
    expect(names.filter((n) => n.startsWith('browser.')).length).toBeGreaterThan(20);

    const observed = must(await session.observe());
    if (observed.status !== 'ok') throw new Error(`observe failed: ${observed.error.message}`);
    // The fixture renders a real window; we should see its accessibility tree.
    expect(observed.value.snapshot.text.length).toBeGreaterThan(0);
    expect(observed.value.snapshot.text).toContain('ref=');
  });

  it('reports a clear error when the app never becomes debuggable', async () => {
    h = await bootTest();
    const target: TargetSpec = { kind: 'electron', appPath: '/nonexistent/app/binary', args: [] };
    const r = await h.resolve(EP.ToolService).allocSession(target, {});
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.code).toBe('TARGET_UNREACHABLE');
  });

  it('fails clearly when asked to attach to a port with nothing on it', async () => {
    h = await bootTest();
    const target: TargetSpec = { kind: 'electron', appPath: 'unused', attach: { cdpPort: 59999 } };
    const r = await h.resolve(EP.ToolService).allocSession(target, {});
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.message).toMatch(/CDP|reachable/i);
  });
});
