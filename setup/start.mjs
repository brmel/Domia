#!/usr/bin/env node
// Cross-platform launcher. `node setup/start.mjs [target] [...args]`
//   desktop (default) -> npm run dev      (Electron app)
//   cli [...args]     -> npm run cli -- [...args]
//   server            -> npm run server   (read-only HTTP API)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [, , targetArg, ...rest] = process.argv;
const target = (targetArg ?? 'desktop').toLowerCase();

if (!existsSync(join(ROOT, 'node_modules'))) {
    console.error('Dependencies missing. Run setup first: npm run setup');
    process.exit(1);
}

const SCRIPTS = {
    desktop: ['run', 'dev'],
    cli: ['run', 'cli', '--', ...rest],
    server: ['run', 'server'],
};

const args = SCRIPTS[target];
if (!args) {
    console.error(`Unknown target "${target}". Use: desktop | cli | server`);
    process.exit(1);
}

// npm is npm.cmd on Windows — shell:true resolves it.
const r = spawnSync('npm', args, { cwd: ROOT, stdio: 'inherit', shell: true, env: process.env });
process.exit(r.status ?? 1);
