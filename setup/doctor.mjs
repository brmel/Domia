#!/usr/bin/env node
// Install health check: verifies everything the agent needs to run.
// `npm run doctor` — exits non-zero if anything is broken.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIN_NODE_MAJOR = 18;

const c = { reset: '\x1b[0m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m' };
let failures = 0;
const pass = (m) => console.log(`${c.green}✓${c.reset} ${m}`);
const warnOnly = (m) => console.log(`${c.yellow}!${c.reset} ${m}`);
const failCheck = (m, hint) => { failures++; console.log(`${c.red}✗${c.reset} ${m}\n  → ${hint}`); };

const nodeMajor = Number(process.versions.node.split('.')[0]);
nodeMajor >= MIN_NODE_MAJOR
    ? pass(`Node ${process.versions.node}`)
    : failCheck(`Node ${process.versions.node} too old`, `Install Node ${MIN_NODE_MAJOR}+ from https://nodejs.org`);

existsSync(join(ROOT, 'node_modules'))
    ? pass('Dependencies installed')
    : failCheck('node_modules missing', 'Run: npm run setup');

const chromium = spawnSync(
    process.execPath,
    ['-e', "const{chromium}=require('playwright');process.exit(require('fs').existsSync(chromium.executablePath())?0:1)"],
    { cwd: ROOT },
);
chromium.status === 0
    ? pass('Playwright Chromium present')
    : failCheck('Playwright Chromium not installed', 'Run: npx playwright install chromium (Linux: add --with-deps)');

const envPath = join(ROOT, '.env');
const envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const hasApiKey = /^\s*(GOOGLE_API_KEY|GEMINI_API_KEY|DOMIA_LLM_API_KEY)\s*=\s*\S+/m.test(envText);
const adcFromEnv = envText.match(/^\s*GOOGLE_APPLICATION_CREDENTIALS\s*=\s*(\S+)/m)?.[1] ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
const adcDropIn = join(homedir(), '.domia', 'gcp-credentials.json');
if (hasApiKey) {
    pass('Gemini auth: API key in .env');
} else if (adcFromEnv && existsSync(adcFromEnv)) {
    pass(`Gemini auth: service account (${adcFromEnv})`);
} else if (existsSync(adcDropIn)) {
    pass(`Gemini auth: service account (${adcDropIn})`);
} else {
    failCheck('No Gemini credentials', `Set GOOGLE_API_KEY in .env (https://aistudio.google.com/apikey), or save a GCP service-account JSON as ${adcDropIn}`);
}

process.env.ELECTRON_RUN_AS_NODE
    ? warnOnly('ELECTRON_RUN_AS_NODE is set in this shell — the desktop app will not boot from here (setup/start.mjs strips it; plain terminals are fine)')
    : pass('Shell environment clean');

console.log(failures === 0 ? `\n${c.green}All checks passed.${c.reset}` : `\n${c.red}${failures} check(s) failed.${c.reset}`);
process.exit(failures === 0 ? 0 : 1);
