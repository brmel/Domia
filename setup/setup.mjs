#!/usr/bin/env node
// Cross-platform setup: verifies Node, installs dependencies + the Playwright
// browser, and seeds a local .env. Runs identically on macOS, Windows, Linux.
import { spawnSync } from 'node:child_process';
import { existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIN_NODE_MAJOR = 18;

const c = {
    reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
    green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m',
};
const log = (m) => console.log(m);
const step = (m) => log(`\n${c.cyan}${c.bold}▸ ${m}${c.reset}`);
const ok = (m) => log(`${c.green}✓${c.reset} ${m}`);
const warn = (m) => log(`${c.yellow}!${c.reset} ${m}`);
const fail = (m) => { log(`${c.red}✗ ${m}${c.reset}`); process.exit(1); };

// npm/npx are .cmd shims on Windows — shell:true lets spawn resolve them.
function run(cmd, args) {
    const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: true, env: process.env });
    if (r.status !== 0) fail(`\`${cmd} ${args.join(' ')}\` failed (exit ${r.status ?? 'signal'}).`);
}

log(`${c.bold}Domia setup${c.reset} ${c.dim}(${process.platform})${c.reset}`);

step('Checking Node.js');
const major = Number(process.versions.node.split('.')[0]);
if (major < MIN_NODE_MAJOR) fail(`Node ${MIN_NODE_MAJOR}+ required, found ${process.versions.node}. See https://nodejs.org.`);
ok(`Node ${process.versions.node}`);

step('Installing dependencies');
run('npm', ['install']);
ok('Dependencies installed');

step('Installing the Playwright browser (Chromium)');
run('npx', ['playwright', 'install', 'chromium']);
ok('Chromium ready');

step('Preparing .env');
const envPath = join(ROOT, '.env');
const examplePath = join(ROOT, '.env.example');
if (existsSync(envPath)) {
    ok('.env already exists — left untouched');
} else if (existsSync(examplePath)) {
    copyFileSync(examplePath, envPath);
    warn('Created .env from .env.example — set GOOGLE_API_KEY before running the agent.');
} else {
    warn('.env.example not found; create a .env with GOOGLE_API_KEY=<your key>.');
}

log(`\n${c.green}${c.bold}Setup complete.${c.reset}`);
log(`${c.dim}Next:${c.reset}`);
log(`  ${c.bold}npm run dev${c.reset}        ${c.dim}# desktop app${c.reset}`);
log(`  ${c.bold}npm run cli -- run --url <url> --prompt "<goal>"${c.reset}`);
log(`  ${c.dim}or:${c.reset} node setup/start.mjs [desktop|cli|server]`);
