import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import * as net from 'net';
import { readdir, stat } from 'fs/promises';

// Electron-app process helpers split into their own module; re-exported so
// existing imports from this file keep working.
export * from './electron-app-helpers';

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

interface CLITestConfig {
    url?: string;
    cdpUrl?: string;
    windowTitle?: string;
    executablePath?: string;
    launchArgs?: string[];
    prompt: string;
    model?: string;
    apiKey?: string;
    maxSteps?: number;
    headless?: boolean;
    vision?: boolean;
    screenshots?: boolean;
    verbose?: boolean;
    debug?: boolean;
    plugins?: {
        /** When explicitly set to false, passes --no-shell to the CLI. */
        shell?: boolean;
    };
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
            if (config.launchArgs?.length) {
                args.push('--launch-args', ...config.launchArgs);
            }
            if (config.windowTitle) {
                args.push('--window-title', config.windowTitle);
            }
        }
        
        args.push('--prompt', config.prompt);
        args.push('--steps', String(config.maxSteps ?? 5));

        if (config.model) {
            args.push('--model', config.model);
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

        if (config.plugins?.shell === false) {
            args.push('--no-shell');
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
    // Human mode prints `Run ID: <id>`; --json mode emits `"runId":"<id>"` / `"id":"<id>"`.
    const humanMatch = output.match(/Run ID:\s*([A-Za-z0-9_-]+)/);
    if (humanMatch?.[1]) {
        return humanMatch[1];
    }

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
            shell: true, // npm resolves to npm.cmd on Windows; shell lets spawn find it
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
