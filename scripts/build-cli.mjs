#!/usr/bin/env node
import { build } from 'esbuild';
import { chmod, cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SPAWNED_AT_RUNTIME = ['@playwright/mcp', 'playwright', 'playwright-core'];
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = join(root, 'dist', 'domia.mjs');

await mkdir(dirname(outfile), { recursive: true });
const result = await build({
  entryPoints: [join(root, 'packages/cli/src/index.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  minify: true,
  metafile: true,
  banner: { js: 'import{createRequire as __cr}from"node:module";const require=__cr(import.meta.url);' },
  external: [...SPAWNED_AT_RUNTIME, 'electron'],
  logLevel: 'warning',
});
await chmod(outfile, 0o755);
await cp(join(root, 'prompts'), join(root, 'dist', 'prompts'), { recursive: true });

for (const pkg of SPAWNED_AT_RUNTIME) {
  await cp(join(root, 'node_modules', pkg), join(root, 'dist', 'node_modules', pkg), { recursive: true, dereference: true });
}

const bytes = Object.values(result.metafile.outputs).find((o) => o.entryPoint)?.bytes ?? 0;
await writeFile(join(root, 'dist', 'meta.json'), JSON.stringify(result.metafile), 'utf8');
console.log(`built ${outfile} (${Math.round(bytes / 1024)} KB)`);
