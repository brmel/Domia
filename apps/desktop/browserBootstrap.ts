import { app, BrowserWindow, dialog } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export function configureBrowserPath(): void {
    if (!app.isPackaged || process.env['PLAYWRIGHT_BROWSERS_PATH']) return;
    process.env['PLAYWRIGHT_BROWSERS_PATH'] = path.join(app.getPath('userData'), 'pw-browsers');
}

export async function ensureChromium(): Promise<void> {
    if (!app.isPackaged) return;
    const { chromium } = await import('playwright');
    if (existsSync(chromium.executablePath())) return;

    const splash = openSplash();
    try {
        await installChromium();
    } catch (error) {
        dialog.showErrorBox(
            'Browser download failed',
            `Domia could not download its automation browser.\n\n${error instanceof Error ? error.message : String(error)}\n\nCheck your network connection and restart the app.`,
        );
        throw error;
    } finally {
        splash.close();
    }
}

function openSplash(): BrowserWindow {
    const splash = new BrowserWindow({
        width: 420,
        height: 140,
        frame: false,
        resizable: false,
        webPreferences: { sandbox: true },
    });
    void splash.loadURL(
        'data:text/html,' +
        encodeURIComponent(
            '<body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;display:grid;place-items:center;height:100vh;margin:0">' +
            '<div><b>Domia — first run</b><br>Downloading the automation browser (~150 MB)…</div></body>',
        ),
    );
    return splash;
}

function installChromium(): Promise<void> {
    // The CLI must run outside the asar, as a plain node process.
    const cli = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'playwright', 'cli.js');
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [cli, 'install', 'chromium'], {
            env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
            stdio: 'pipe',
        });
        let tail = '';
        child.stderr?.on('data', (d: Buffer) => { tail = `${tail}${d}`.slice(-2000); });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`playwright install exited with ${code}: ${tail.slice(-500)}`));
        });
    });
}
