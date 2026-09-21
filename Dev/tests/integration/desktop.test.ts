import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { EP, brandId } from '@domia/contracts';
import type { TargetSession, TargetSpec, ToolOutput, Outcome } from '@domia/contracts';
import { bootTest, must, type Harness, tmpDir } from './harness.js';

const RELEASE = join(import.meta.dirname, '..', '..', 'packages', 'hosts', 'desktop', 'release');

function packagedApp(): string | null {
  const candidates = [
    join(RELEASE, 'mac-arm64', 'Domia.app', 'Contents', 'MacOS', 'Domia'),
    join(RELEASE, 'mac', 'Domia.app', 'Contents', 'MacOS', 'Domia'),
    join(RELEASE, 'linux-unpacked', 'domia'),
    join(RELEASE, 'win-unpacked', 'Domia.exe'),
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
}

const appPath = packagedApp();

describe.skipIf(!appPath)('packaged desktop app renders and answers its own IPC', () => {
  let h: Harness;
  let session: TargetSession;

  beforeAll(async () => {
    process.env['DOMIA_DATA_DIR'] = tmpDir('app');
    h = await bootTest();
    const target: TargetSpec = { kind: 'electron', appPath: appPath!, args: [] };
    session = must(await h.resolve(EP.ToolService).allocSession(target, {}));
  }, 120_000);

  afterAll(async () => {
    await session?.dispose();
    await h?.dispose();
    delete process.env['DOMIA_DATA_DIR'];
  });

  it('renders the app shell with every feature view reachable', async () => {
    const observed = must(await session.observe());
    if (observed.status !== 'ok') throw new Error(`observe failed: ${observed.error.message}`);
    const text = observed.value.snapshot.text;
    for (const nav of ['Cases', 'Runs', 'Skills', 'Memory', 'Settings']) expect(text).toContain(nav);
  }, 60_000);

  it('navigates to Settings, which only renders once the backend answers over IPC', async () => {
    const before = must(await session.observe());
    if (before.status !== 'ok') throw new Error('observe failed');
    const line = before.value.snapshot.text.split('\n').find((l) => l.includes('Settings') && /\[ref=[^\]]+\]/.test(l));
    expect(line, 'expected a Settings control with a ref').toBeDefined();
    const ref = /\[ref=([^\]]+)\]/.exec(line!)?.[1];

    const clicked = await session.invoke({ callId: brandId<'CallId'>('desktop1'), name: 'browser.click', args: { element: 'Settings nav item', target: ref } });
    const outcome: Outcome<ToolOutput> = must(clicked);
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.value.observation?.snapshot.text).toMatch(/Personas|Providers|Model|Settings/);
  }, 60_000);
});
