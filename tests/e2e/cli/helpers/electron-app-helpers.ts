import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

export async function launchElectronApp(appPath: string, cdpPort: number = 9222): Promise<ChildProcess> {
    return new Promise((resolve, reject) => {
        // Use Env Var instead of flag to avoid "bad option" errors
        const env = { ...process.env, ELECTRON_REMOTE_DEBUGGING_PORT: cdpPort.toString() };

        const app = spawn(appPath, [], {
            detached: false,
            stdio: 'pipe',
            env
        });

        app.stdout?.on('data', (data) => {
            const output = data.toString();
            console.log(`[Electron App] ${output}`);
        });

        app.stderr?.on('data', (data) => {
            console.error(`[Electron App Error] ${data.toString()}`);
        });

        app.on('error', (error) => {
            reject(error);
        });

        // Give it a small delay to crash if it's going to crash immediately, catch startup errors
        // but verify startup externally (e.g. via waitForCDP)
        setTimeout(() => resolve(app), 2000);
    });
}

export function killElectronApp(app: ChildProcess): Promise<void> {
    return new Promise((resolve) => {
        if (app.killed) {
            resolve();
            return;
        }

        app.on('close', () => {
            resolve();
        });

        app.kill('SIGTERM');

        setTimeout(() => {
            if (!app.killed) {
                app.kill('SIGKILL');
            }
            resolve();
        }, 5000);
    });
}

export async function waitForCDP(port: number, timeoutMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await fetch(`http://localhost:${port}/json/version`, {
                signal: AbortSignal.timeout(2000)
            });
            if (response.ok) {
                return true;
            }
        } catch {
            // Not ready yet
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return false;
}

export function getElectronAppPath(): string | null {
    const platform = process.platform;
    let appPath: string;

    if (platform === 'darwin') {
        appPath = './release/mac/Domia.app/Contents/MacOS/Domia';
    } else if (platform === 'win32') {
        appPath = './release/win-unpacked/Domia.exe';
    } else {
        appPath = './release/linux-unpacked/domia';
    }

    if (existsSync(join(process.cwd(), appPath))) {
        return join(process.cwd(), appPath);
    }

    return null;
}

export async function buildElectronApp(): Promise<boolean> {
    console.log('📦 Building Electron app...');

    return new Promise((resolve) => {
        const build = spawn('npm', ['run', 'build'], {
            cwd: process.cwd(),
            stdio: 'inherit'
        });

        build.on('close', (code) => {
            resolve(code === 0);
        });

        build.on('error', () => {
            resolve(false);
        });
    });
}
