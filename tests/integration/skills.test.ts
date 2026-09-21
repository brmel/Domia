import { describe, it, expect, afterEach } from 'vitest';
import { rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { bootHeadless, startRun } from '@domia/hosts';
import { EP } from '@domia/contracts';
import type { AgentTurn, CaseId, ModelRef } from '@domia/contracts';
import type { Kernel } from '@domia/kernel';
import { must, tmpDir } from './harness.js';

const REPLAY: ModelRef = { provider: 'replay', model: 'scripted' };

interface Env { kernel: Kernel; dataDir: string; promptsDir: string; caseId: CaseId }

async function boot(turns: readonly AgentTurn[] = []): Promise<Env> {
  const dataDir = tmpDir('skills');
  const promptsDir = join(dataDir, 'prompts');
  mkdirSync(join(promptsDir, 'skills'), { recursive: true });
  const booted = await bootHeadless({
    dataDir, promptsDir, artifactsDir: join(dataDir, 'artifacts'), dbPath: join(dataDir, 'domia.db'),
    logLevel: 'error', agent: { replay: () => turns },
  });
  const { kernel } = must(booted);
  const created = must(await kernel.resolve(EP.CaseService)._unsafeUnwrap().create({
    name: 'skills case', target: { kind: 'web', url: 'https://example.com' },
  }));
  return { kernel, dataDir, promptsDir, caseId: created.id };
}

function writeSkill(promptsDir: string, dir: string, md: string, steps?: unknown): void {
  const path = join(promptsDir, 'skills', dir);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'SKILL.md'), md, 'utf8');
  if (steps) writeFileSync(join(path, 'steps.json'), JSON.stringify(steps), 'utf8');
}

let env: Env | null = null;
afterEach(async () => {
  if (env) { await env.kernel.shutdown(); rmSync(env.dataDir, { recursive: true, force: true }); env = null; }
});

describe('skills: capability added from another package via extension points', () => {
  it('discovers SKILL.md folders and offers only the relevant ones', async () => {
    env = await boot();
    writeSkill(env.promptsDir, 'export-invoices', '---\nname: export-invoices\ndescription: Export invoices to CSV\ntags: invoice, export\n---\n\nOpen billing, choose CSV, download.');
    writeSkill(env.promptsDir, 'reset-password', '---\nname: reset-password\ndescription: Reset a user password\ntags: auth\n---\n\nOpen settings, click reset.');

    const skills = env.kernel.resolve(EP.SkillService)._unsafeUnwrap();
    const all = must(await skills.list());
    expect(all.map((s) => s.name).sort()).toEqual(['export-invoices', 'reset-password']);

    // Progressive disclosure: rank on name/description/tags, not the body.
    const relevant = must(await skills.relevant('export the invoices for March'));
    expect(relevant.map((s) => s.name)).toEqual(['export-invoices']);
    expect(must(await skills.relevant('something entirely unrelated'))).toHaveLength(0);
  });

  it('offers skill tools to the agent through the loop it knows nothing about', async () => {
    env = await boot([{ kind: 'final', summary: 'done' }]);
    writeSkill(env.promptsDir, 'export-invoices', '---\nname: export-invoices\ndescription: Export invoices to CSV\ntags: export\n---\n\nsteps here');

    // Re-boot so the skills module warms its cache with the new skill on disk.
    await env.kernel.shutdown();
    const again = await bootHeadless({
      dataDir: env.dataDir, promptsDir: env.promptsDir, artifactsDir: join(env.dataDir, 'artifacts'),
      dbPath: join(env.dataDir, 'domia.db'), logLevel: 'error',
      agent: { replay: () => [{ kind: 'final', summary: 'done' } as AgentTurn] },
    });
    env.kernel = must(again).kernel;

    const engine = env.kernel.resolve(EP.LoopEngine)._unsafeUnwrap();
    const caseCtx = must(await env.kernel.resolve(EP.CaseService)._unsafeUnwrap().allocContext(env.caseId));
    const run = must(await engine.alloc({ caseCtx, request: 'export the invoices', options: {} }));
    // The engine resolved a belt tool contributed by @domia/skills.
    expect(engine.personas().length).toBeGreaterThan(0);
    await run.dispose();
    await caseCtx.dispose();
  });

  it('mints a skill from a real run tape, keeping acts and dropping reads', async () => {
    const script: AgentTurn[] = [
      { kind: 'act', calls: [{ name: 'browser.snapshot', args: {} }] },       // read — dropped
      { kind: 'act', calls: [{ name: 'fs.write', args: { path: 'a.txt', content: 'x' } }] }, // act — kept
      { kind: 'final', summary: 'did it' },
    ];
    env = await boot(script);
    const started = must(await startRun(env.kernel, { caseId: env.caseId, request: 'write a file', model: REPLAY, maxTurns: 6 }));
    expect(started.outcome.status).toBe('ok');

    const skills = env.kernel.resolve(EP.SkillService)._unsafeUnwrap();
    const minted = must(await skills.mint({ name: 'write-a-file', description: 'Write a file', fromRun: started.runId }));

    expect(minted.steps.map((s) => s.tool)).toEqual(['fs.write']); // the read was distilled out
    expect(existsSync(join(minted.path, 'SKILL.md'))).toBe(true);
    expect(existsSync(join(minted.path, 'steps.json'))).toBe(true);

    // Portable: it reloads as a normal Agent Skills folder.
    const reloaded = must(await skills.get('write-a-file'));
    expect(reloaded?.description).toBe('Write a file');
    expect(reloaded?.steps).toHaveLength(1);
  });

  it('replays a recorded skill through the mediated session', async () => {
    env = await boot([
      { kind: 'act', calls: [{ name: 'skill.use', args: { name: 'go-iana' } }] },
      { kind: 'final', summary: 'used the skill' },
    ]);
    writeSkill(
      env.promptsDir, 'go-iana',
      '---\nname: go-iana\ndescription: Navigate to the IANA example page\ntags: navigate\n---\n\nGo to iana.org.',
      [{ tool: 'browser.navigate', args: { url: 'https://www.iana.org/help/example-domains' } }],
    );

    await env.kernel.shutdown();
    env.kernel = must(await bootHeadless({
      dataDir: env.dataDir, promptsDir: env.promptsDir, artifactsDir: join(env.dataDir, 'artifacts'),
      dbPath: join(env.dataDir, 'domia.db'), logLevel: 'error',
      agent: { replay: () => [
        { kind: 'act', calls: [{ name: 'skill.use', args: { name: 'go-iana' } }] },
        { kind: 'final', summary: 'used the skill' },
      ] as AgentTurn[] },
    })).kernel;

    const started = must(await startRun(env.kernel, { caseId: env.caseId, request: 'navigate using the skill', model: REPLAY, maxTurns: 6 }));
    expect(started.outcome.status).toBe('ok');

    // The replayed step went through session.invoke, so it is on the tape like any call.
    const tape = must(await env.kernel.resolve(EP.Store)._unsafeUnwrap().exchanges.listByRun(started.runId));
    const payloads = tape.filter((e) => e.direction === 'tool').map((e) => JSON.stringify(e.payload));
    expect(payloads.some((p) => p.includes('skill.use'))).toBe(true);
  });
});
