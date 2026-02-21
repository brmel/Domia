import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import * as net from 'net';
import { readdir, stat } from 'fs/promises';

export async function getFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, () => {
            const port = (server.address() as net.AddressInfo).port;
            server.close(() => {
                resolve(port);
            });
        });
    });
}

export interface CLITestConfig {
    url?: string;
    cdpUrl?: string;
    windowTitle?: string;
    executablePath?: string;
    launchArgs?: string[];
    prompt: string;
    provider?: 'google';
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    maxSteps?: number;
    headless?: boolean;
    vision?: boolean;
    screenshots?: boolean;
    verbose?: boolean;
    debug?: boolean;
}

export interface CLITestResult {
    success: boolean;
    output: string;
    errors: string[];
    duration: number;
    exitCode: number;
    runId?: string;
}

export async function runCLITest(config: CLITestConfig): Promise<CLITestResult> {
    const startTime = Date.now();
    
    try {
        const args = ['run'];
        
        // Dynamic port allocation for Electron tests
        let envUpdates: Record<string, string> = {};

        if (config.executablePath) {
            const port = await getFreePort();
            envUpdates['ELECTRON_REMOTE_DEBUGGING_PORT'] = port.toString();
            
            // Allow launch args to override or append
            const launchArgs = config.launchArgs || [];
            // Note: We rely on env var to set port to avoid "bad option" errors with packaged apps
            
            // Pass back to config for args generation below
            config.launchArgs = launchArgs;
        }

        if (config.url) {
            args.push('--url', config.url);
        } else if (config.cdpUrl) {
            args.push('--cdp-url', config.cdpUrl);
            if (config.windowTitle) {
                args.push('--window-title', config.windowTitle);
            }
        } else if (config.executablePath) {
            args.push('--executable-path', config.executablePath);
            if (config.launchArgs) {
                // Join args with comma for CLI parsing compatibility if needed, or pass multiple fields?
                // RunCommand expects comma-separated string for --launch-args
                args.push('--launch-args', config.launchArgs.join(','));
            }
            if (config.windowTitle) {
                args.push('--window-title', config.windowTitle);
            }
        }
        
        args.push('--prompt', config.prompt);
        args.push('--steps', String(config.maxSteps ?? 5));

        if (config.provider) {
            args.push('--provider', config.provider);
        }

        if (config.model) {
            args.push('--model', config.model);
        }

        if (config.baseUrl) {
            args.push('--base-url', config.baseUrl);
        }

        if (config.apiKey) {
            args.push('--api-key', config.apiKey);
        }
        
        if (!config.headless) {
            args.push('--no-headless');
        }
        
        if (config.vision) {
            args.push('--vision');
        }
        
        if (config.screenshots) {
            args.push('--screenshots');
        }

        if (config.verbose) {
            args.push('--verbose');
        }

        if (config.debug) {
            args.push('--debug');
        }
        
        const result = await spawnCLI(args, envUpdates);
        const duration = Date.now() - startTime;
        
        const output = result.stdout + result.stderr;
        const success = result.exitCode === 0 && (
            output.includes('✔') ||
            output.includes('Mission Accomplished') ||
            output.includes('passed') ||
            output.includes('success')
        );
        
        const errors = extractErrors(output);
        
        return {
            success,
            output,
            errors,
            duration,
            exitCode: result.exitCode,
            ...(extractRunId(output) ? { runId: extractRunId(output) as string } : {})
        };
    } catch (error) {
        const duration = Date.now() - startTime;
        return {
            success: false,
            output: '',
            errors: [error instanceof Error ? error.message : String(error)],
            duration,
            exitCode: 1
        };
    }
}

function extractRunId(output: string): string | undefined {
    const jsonMatch = output.match(/"id"\s*:\s*"([A-Za-z0-9_-]+)"/);
    if (jsonMatch?.[1]) {
        return jsonMatch[1];
    }

    const runIdMatch = output.match(/"runId"\s*:\s*"([A-Za-z0-9_-]+)"/);
    if (runIdMatch?.[1]) {
        return runIdMatch[1];
    }

    return undefined;
}

export async function runCLICommand(args: string[], extraEnv: Record<string, string> = {}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return spawnCLI(args, extraEnv);
}

export async function getLatestRunId(): Promise<string | null> {
    const result = await runCLICommand(['history', 'list', '--limit', '1']);
    if (result.exitCode !== 0) {
        return null;
    }

    const outputLines = (result.stdout + result.stderr)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    const candidate = outputLines.find((line) => line.includes('|'));
    if (!candidate) {
        return null;
    }

    const match = candidate.match(/^([^\s|]+)\s*\|/);
    return match?.[1] || null;
}

export async function findRunStepAsset(runId: string, suffix: string): Promise<string | null> {
    const stepsDir = join(process.cwd(), 'artifacts', runId, 'steps');
    if (!existsSync(stepsDir)) {
        return null;
    }

    const files = await readdir(stepsDir);
    const candidates = files
        .filter((name) => name.endsWith(suffix))
        .map((name) => join(stepsDir, name));

    if (candidates.length === 0) {
        return null;
    }

    const withStats = await Promise.all(candidates.map(async (filePath) => ({
        filePath,
        fileStat: await stat(filePath)
    })));

    withStats.sort((a, b) => b.fileStat.mtimeMs - a.fileStat.mtimeMs);
    return withStats[0]?.filePath || null;
}

export async function listRunStepAssets(runId: string, suffix: string): Promise<string[]> {
    const stepsDir = join(process.cwd(), 'artifacts', runId, 'steps');
    if (!existsSync(stepsDir)) {
        return [];
    }

    const files = await readdir(stepsDir);
    return files
        .filter((name) => name.endsWith(suffix))
        .map((name) => join(stepsDir, name));
}

function spawnCLI(args: string[], extraEnv: Record<string, string> = {}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        
        const cli = spawn('npm', ['run', 'cli', '--', ...args], {
            cwd: process.cwd(),
            env: { ...process.env, ...extraEnv, NODE_OPTIONS: '--no-deprecation' }
        });
        
        cli.stdout?.on('data', (data) => {
            const str = data.toString();
            stdout += str;
            process.stdout.write(data);
        });
        
        cli.stderr?.on('data', (data) => {
            const str = data.toString();
            // Filter noise
            if (str.includes('[DEP0190]') || str.includes('DeprecationWarning')) return;
            stderr += str;
            process.stderr.write(data);
        });
        
        cli.on('close', (code) => {
            resolve({ stdout, stderr, exitCode: code || 0 });
        });
        
        cli.on('error', (error) => {
            stderr += error.message;
            resolve({ stdout, stderr, exitCode: 1 });
        });
    });
}

function extractErrors(output: string): string[] {
    const errors: string[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
        if (
            line.includes('Error:') ||
            line.includes('Failed:') ||
            line.includes('❌') ||
            line.toLowerCase().includes('error')
        ) {
            errors.push(line.trim());
        }
    }
    
    return errors;
}

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

export function logTestResult(testName: string, result: CLITestResult): void {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 Test: ${testName}`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`Status: ${result.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Duration: ${result.duration}ms`);
    console.log(`Exit Code: ${result.exitCode}`);
    
    if (result.errors.length > 0) {
        console.log(`\nErrors (${result.errors.length}):`);
        result.errors.forEach((error, i) => {
            console.log(`  ${i + 1}. ${error}`);
        });
    }
    
    console.log(`${'═'.repeat(60)}\n`);
}
