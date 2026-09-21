import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export interface NodeRunner { readonly command: string; readonly env?: Record<string, string> }

function shippedResourcesDir(): string | undefined {
  return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
}

function resolveFromNodeModules(): string {
  const from = typeof __dirname === 'string' ? join(__dirname, 'index.js') : import.meta.url;
  return join(dirname(createRequire(from).resolve('@playwright/mcp/package.json')), 'cli.js');
}

function resolveFromPackagedResources(): string | undefined {
  const resources = shippedResourcesDir();
  if (!resources) return undefined;
  const shipped = join(resources, 'node_modules', '@playwright', 'mcp', 'cli.js');
  return existsSync(shipped) ? shipped : undefined;
}

export function playwrightMcpCli(): string {
  try {
    return resolveFromNodeModules();
  } catch {
    const shipped = resolveFromPackagedResources();
    if (shipped) return shipped;
    throw new Error('playwright-mcp not found: install @playwright/mcp or ship it under resources/node_modules');
  }
}

export function nodeRunner(): NodeRunner {
  const runningInsideElectron = Boolean(process.versions['electron']);
  return runningInsideElectron
    ? { command: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' } }
    : { command: 'node' };
}
