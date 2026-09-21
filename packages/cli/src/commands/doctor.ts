import { existsSync, accessSync, constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { bootHeadless } from '@domia/hosts';
import { EP } from '@domia/contracts';

interface Check { name: string; ok: boolean; detail: string }

export async function doctor(json: boolean): Promise<number> {
  const checks: Check[] = [];

  // Platform prerequisites — checked before boot so failures are actionable.
  const major = Number(process.versions.node.split('.')[0]);
  checks.push({ name: 'node >= 22', ok: major >= 22, detail: `${process.version} (node:sqlite needs 22+)` });
  checks.push({ name: 'node:sqlite', ok: hasSqlite(), detail: hasSqlite() ? 'built-in available' : 'unavailable — upgrade Node to 22+' });
  checks.push({ name: 'platform', ok: true, detail: `${process.platform}/${process.arch}` });
  const pw = resolvePlaywrightMcp();
  checks.push({ name: 'playwright-mcp', ok: pw !== null, detail: pw ?? 'not resolvable — run `npm install`' });
  const browser = await resolveChromium();
  checks.push({ name: 'chromium', ok: browser !== null, detail: browser ?? 'not installed — run `npx playwright install chromium` (the agent has nothing to drive without it)' });

  const boot = await bootHeadless();
  if (boot.isErr()) {
    checks.push({ name: 'boot', ok: false, detail: boot.error.message });
    report(checks, json);
    return 1;
  }
  const { kernel, config } = boot.value;
  checks.push({ name: 'kernel', ok: true, detail: 'modules loaded (trace-first)' });

  // after boot: bootHeadless() loads .env into the environment
  const key = ['GOOGLE_GENERATIVE_AI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENAI_COMPATIBLE_BASE_URL'].find((k) => process.env[k]);
  checks.push({ name: 'model api key', ok: Boolean(key), detail: key ? `${key} set` : 'none — set GOOGLE_GENERATIVE_AI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENAI_COMPATIBLE_BASE_URL (or put it in .env)' });

  checks.push({ name: 'prompts dir', ok: existsSync(config.promptsDir), detail: config.promptsDir });
  checks.push({ name: 'data dir writable', ok: writable(config.dataDir), detail: config.dataDir });
  checks.push({ name: 'db path writable', ok: writable(dirname(config.dbPath)), detail: config.dbPath });

  // exercise the trace pipeline end to end: a span must land in trace.jsonl
  const tracerRes = kernel.resolve(EP.Tracer);
  if (tracerRes.isOk()) {
    const span = tracerRes.value.span('doctor.selfcheck', { source: 'doctor' });
    span.setAttrs({ ok: true });
    span.end('ok');
    tracerRes.value.event('doctor.ran');
  }
  await kernel.shutdown(); // flushes sinks

  const jsonlPath = join(config.artifactsDir, 'trace.jsonl');
  checks.push({ name: 'trace.jsonl written', ok: existsSync(jsonlPath), detail: jsonlPath });

  const allOk = checks.every((c) => c.ok);
  report(checks, json);
  return allOk ? 0 : 1;
}

function hasSqlite(): boolean {
  try { createRequire(import.meta.url)('node:sqlite'); return true; } catch { return false; }
}

async function resolveChromium(): Promise<string | null> {
  try {
    const { chromium } = (await import('playwright-core')) as { chromium: { executablePath(): string } };
    const path = chromium.executablePath();
    return existsSync(path) ? path : null;
  } catch {
    return null;
  }
}

function resolvePlaywrightMcp(): string | null {
  try { return join(dirname(createRequire(import.meta.url).resolve('@playwright/mcp/package.json')), 'cli.js'); } catch { return null; }
}

function writable(dir: string): boolean {
  try {
    let d = dir;
    while (!existsSync(d) && dirname(d) !== d) d = dirname(d);
    accessSync(d, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function report(checks: Check[], json: boolean): void {
  if (json) { console.log(JSON.stringify({ checks }, null, 2)); return; }
  for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name.padEnd(20)} ${c.detail}`);
  console.log(checks.every((c) => c.ok) ? '\ndoctor: all green' : '\ndoctor: issues found');
}
