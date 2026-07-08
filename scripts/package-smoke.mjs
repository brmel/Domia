#!/usr/bin/env node
// Packaging smoke test: build the unpacked app, launch the real binary,
// and assert the renderer boots. Catches missing runtime modules that the
// dev workflow (node_modules present) can never catch.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:net';

const ROOT = process.cwd();
const isWin = process.platform === 'win32';

function run(cmd, args, env = {}) {
    const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: isWin, env: { ...process.env, ...env } });
    if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
}

function packedBinary() {
    const candidates = {
        darwin: [`release/mac-${process.arch}/Domia.app/Contents/MacOS/Domia`, 'release/mac/Domia.app/Contents/MacOS/Domia'],
        win32: ['release/win-unpacked/Domia.exe'],
        linux: ['release/linux-unpacked/domia'],
    }[process.platform];
    const hit = candidates.find((c) => existsSync(path.join(ROOT, c)));
    if (!hit) throw new Error(`No packed binary found; looked at: ${candidates.join(', ')}`);
    return path.join(ROOT, hit);
}

function freePort() {
    return new Promise((resolve, reject) => {
        const s = createServer();
        s.on('error', reject);
        s.listen(0, '127.0.0.1', () => {
            const p = s.address().port;
            s.close(() => resolve(p));
        });
    });
}

async function waitForRenderer(port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
            const page = targets.find((t) => t.type === 'page' && t.url.startsWith('file://'));
            if (page) return page;
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`Renderer did not appear on CDP :${port} within ${timeoutMs}ms`);
}

console.log('▸ Building');
run('npm', ['run', 'build']);
console.log('▸ Packaging (unpacked dir)');
run('npx', ['electron-builder', '--dir'], { CSC_IDENTITY_AUTO_DISCOVERY: 'false' });

const binary = packedBinary();
const port = await freePort();
console.log(`▸ Launching ${binary} (CDP :${port})`);

const env = { ...process.env, ELECTRON_REMOTE_DEBUGGING_PORT: String(port) };
delete env.ELECTRON_RUN_AS_NODE;
delete env.NODE_OPTIONS;
const child = spawn(binary, [], { env, stdio: 'pipe' });
let appLog = '';
child.stdout.on('data', (d) => { appLog += d; });
child.stderr.on('data', (d) => { appLog += d; });
let exited = null;
child.on('close', (code) => { exited = code; });

try {
    const page = await waitForRenderer(port, 120_000);
    if (exited !== null) throw new Error(`App exited early (${exited})`);
    console.log(`✓ Renderer up: ${page.title || page.url}`);

    const { chromium } = await import('playwright');
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const ui = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith('file://'));
    if (!ui) throw new Error('No file:// page over CDP');
    await ui.waitForSelector('text=Domia Control Plane', { timeout: 30_000 });
    console.log('✓ UI rendered (Domia Control Plane visible)');

    // Opening History forces a real DB query through IPC → sql.js/kysely —
    // exactly the packaged externals the dev workflow can't validate.
    await ui.getByRole('button', { name: 'Compose' }).click();
    await ui.getByRole('button', { name: 'History' }).click();
    await ui.waitForSelector('text=History', { timeout: 30_000 });
    console.log('✓ History opened (SQLite stack loads in the packaged app)');
    await browser.close();
    console.log('\nPackaging smoke: PASS');
} catch (error) {
    console.error(`\nPackaging smoke: FAIL — ${error.message}`);
    console.error('--- app output (tail) ---');
    console.error(appLog.slice(-3000));
    process.exitCode = 1;
} finally {
    child.kill();
}
