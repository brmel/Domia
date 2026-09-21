import { describe, it, expect, afterEach } from 'vitest';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bootHeadless, startRun } from '@domia/hosts';
import { EP } from '@domia/contracts';
import type { AgentTurn, ModelRef } from '@domia/contracts';
import type { Kernel } from '@domia/kernel';
import { must, tmpDir } from './harness.js';

const REPLAY: ModelRef = { provider: 'replay', model: 'scripted' };

/**
 * A plugin written the way a third party would write one: a folder with a
 * manifest and a module that registers a belt tool. Nothing in the repo knows it
 * exists — if the agent can call `demo.echo`, the extension points really are open.
 */
const PLUGIN_SOURCE = `
import { z } from 'zod';
import { resultOk, moduleId, EP, outcomeOk, metaSince, brandId } from '@domia/contracts';

const ID = moduleId('demo-plugin');
const meta = () => metaSince(new Date().toISOString(), brandId('demoT'), brandId('demoS'));

const handler = {
  manifests: () => [{
    name: 'demo.echo',
    description: 'Echo a message back — proof a plugin can add a belt tool.',
    parameters: z.object({ message: z.string() }),
    output: z.unknown(),
    capabilities: ['meta'],
    risk: 'safe',
  }],
  dispatch: async (call) => resultOk(outcomeOk({ value: { echoed: call.args.message } }, meta())),
};

export default function demoPlugin() {
  return {
    manifest: { id: ID, version: '1.0.0', provides: [EP.MetaTool], requires: [] },
    async init(host) {
      const r = host.register(EP.MetaTool, handler);
      if (r.isErr()) return r;
      return resultOk(undefined);
    },
    async dispose() {},
  };
}
`;

let ctx: { kernel: Kernel; dataDir: string } | null = null;
afterEach(async () => {
  if (ctx) { await ctx.kernel.shutdown(); rmSync(ctx.dataDir, { recursive: true, force: true }); ctx = null; }
});

async function bootWithPlugin(source: string | null, turns: readonly AgentTurn[]): Promise<{ kernel: Kernel; dataDir: string; caseId: import('@domia/contracts').CaseId }> {
  const dataDir = tmpDir('plug');
  const pluginsDir = join(dataDir, 'plugins');
  if (source !== null) {
    const dir = join(pluginsDir, 'demo');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'domia-plugin.json'), JSON.stringify({ name: 'demo', version: '1.0.0', entry: './index.mjs' }), 'utf8');
    writeFileSync(join(dir, 'index.mjs'), source, 'utf8');
  } else {
    mkdirSync(pluginsDir, { recursive: true });
  }
  const booted = await bootHeadless({
    dataDir, pluginsDir, artifactsDir: join(dataDir, 'artifacts'), dbPath: join(dataDir, 'domia.db'),
    logLevel: 'error', agent: { replay: () => turns },
  });
  const { kernel } = must(booted);
  const created = must(await kernel.resolve(EP.CaseService)._unsafeUnwrap().create({
    name: 'plugin case', target: { kind: 'web', url: 'https://example.com' },
  }));
  return { kernel, dataDir, caseId: created.id };
}

describe('plugins: third-party modules load through the same kernel', () => {
  it('lets a plugin add a belt tool the agent can actually call', async () => {
    const script: AgentTurn[] = [
      { kind: 'act', calls: [{ name: 'demo.echo', args: { message: 'hello from a plugin' } }] },
      { kind: 'final', summary: 'plugin tool worked' },
    ];
    const env = await bootWithPlugin(PLUGIN_SOURCE, script);
    ctx = { kernel: env.kernel, dataDir: env.dataDir };

    const started = must(await startRun(env.kernel, { caseId: env.caseId, request: 'use the plugin tool', model: REPLAY, maxTurns: 5 }));
    expect(started.outcome.status).toBe('ok');

    const tape = must(await env.kernel.resolve(EP.Store)._unsafeUnwrap().exchanges.listByRun(started.runId));
    const toolCalls = tape.filter((e) => e.direction === 'tool').map((e) => JSON.stringify(e.payload));
    expect(toolCalls.some((p) => p.includes('demo.echo'))).toBe(true);
    expect(toolCalls.some((p) => p.includes('"status":"ok"'))).toBe(true);
  });

  it('boots cleanly when there are no plugins', async () => {
    const env = await bootWithPlugin(null, [{ kind: 'final', summary: 'no plugins needed' }]);
    ctx = { kernel: env.kernel, dataDir: env.dataDir };
    const started = must(await startRun(env.kernel, { caseId: env.caseId, request: 'plain run', model: REPLAY, maxTurns: 5 }));
    expect(started.outcome.status).toBe('ok');
  });

  it('refuses to boot on a broken plugin rather than starting half-configured', async () => {
    const dataDir = tmpDir('plug-bad');
    const dir = join(dataDir, 'plugins', 'broken');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'domia-plugin.json'), JSON.stringify({ name: 'broken', entry: './missing.mjs' }), 'utf8');

    const booted = await bootHeadless({
      dataDir, pluginsDir: join(dataDir, 'plugins'), artifactsDir: join(dataDir, 'artifacts'),
      dbPath: join(dataDir, 'domia.db'), logLevel: 'error',
    });
    expect(booted.isErr()).toBe(true);
    if (booted.isErr()) expect(booted.error.message).toContain('broken');
    rmSync(dataDir, { recursive: true, force: true });
  });
});
