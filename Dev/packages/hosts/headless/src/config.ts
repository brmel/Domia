import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { installCandidates } from './paths.js';

export interface HostConfig {
  readonly dataDir: string;
  readonly artifactsDir: string;
  readonly promptsDir: string;
  readonly pluginsDir?: string;
  readonly dbPath: string;
  readonly logLevel?: 'debug' | 'info' | 'warn' | 'error';
  readonly values?: Readonly<Record<string, unknown>>;
}

export function findPromptsDir(): string {
  const override = process.env['DOMIA_PROMPTS_DIR'];
  if (override) return resolve(override);

  const cwdPrompts = join(process.cwd(), 'prompts');
  const candidates = [...installCandidates('prompts'), cwdPrompts];
  return candidates.find(existsSync) ?? cwdPrompts;
}

export function defaultHostConfig(overrides?: Partial<HostConfig>): HostConfig {
  const dataDir = overrides?.dataDir ?? process.env['DOMIA_DATA_DIR'] ?? join(homedir(), '.domia');
  return {
    dataDir,
    artifactsDir: overrides?.artifactsDir ?? join(dataDir, 'artifacts'),
    promptsDir: overrides?.promptsDir ?? findPromptsDir(),
    pluginsDir: overrides?.pluginsDir ?? join(dataDir, 'plugins'),
    dbPath: overrides?.dbPath ?? join(dataDir, 'domia.db'),
    logLevel: overrides?.logLevel ?? 'info',
    ...(overrides?.values ? { values: overrides.values } : {}),
  };
}
