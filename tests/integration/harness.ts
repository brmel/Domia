import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootHeadless } from '@domia/hosts';
import { EP } from '@domia/contracts';
import type { Kernel } from '@domia/kernel';
import type { CaseId, ExtensionPoint, ModuleResult, TargetSpec } from '@domia/contracts';

/**
 * Integration harness: a real kernel, real SQLite, real providers — only the data
 * directory is disposable. Nothing is mocked; the point is to exercise the seams
 * exactly as they run in production.
 */
export interface Harness {
  readonly kernel: Kernel;
  readonly dataDir: string;
  readonly promptsDir: string;
  resolve<T>(point: ExtensionPoint<T>): T;
  dispose(): Promise<void>;
}

export function tmpDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `domia-${prefix}-`));
}

/** Unwrap in tests — a failure here should fail the test loudly, with the reason. */
export function must<T>(r: ModuleResult<T>): T {
  if (r.isErr()) throw new Error(`expected ok, got ${r.error.code}: ${r.error.message}`);
  return r.value;
}

/** Unwrap a wire-safe ApiResult in tests. */
export function mustApi<T>(r: { ok: true; data: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.data;
}

export async function bootTest(): Promise<Harness> {
  const dataDir = tmpDir('it');
  const booted = await bootHeadless({
    dataDir,
    artifactsDir: join(dataDir, 'artifacts'),
    dbPath: join(dataDir, 'domia.db'),
    logLevel: 'error',
  });
  const { kernel, config } = must(booted);

  return {
    kernel,
    dataDir,
    promptsDir: config.promptsDir,
    resolve<T>(point: ExtensionPoint<T>): T {
      return must(kernel.resolve(point));
    },
    async dispose() {
      await kernel.shutdown();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export const WEB_TARGET: TargetSpec = { kind: 'web', url: 'https://example.com' };

export async function makeCase(h: Harness, name = 'IT case'): Promise<CaseId> {
  const created = await h.resolve(EP.CaseService).create({ name, target: WEB_TARGET });
  return must(created).id;
}
