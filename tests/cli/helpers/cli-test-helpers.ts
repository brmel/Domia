import { spawn, ChildProcess } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

export interface CLITestConfig {
    url?: string;
    cdpUrl?: string;
    windowTitle?: string;
    executablePath?: string;
    launchArgs?: string[];
    prompt: string;
    maxSteps?: number;
    headless?: boolean;
    vision?: boolean;
    screenshots?: boolean;
}

export interface CLITestResult {
    success: boolean;
    output: string;
    errors: string[];
    duration: number;
    exitCode: number;
}

export async function runCLITest(config: CLITestConfig): Promise<CLITestResult> {
    const configPath = join(process.cwd(), '.domia-test-config.json');
    const startTime = Date.now();
    
    try {
        let platformConfig;
        
        if (config.url) {
            platformConfig = {
                platform: 'web',
                url: config.url,
                prompt: config.prompt
            };
        } else if (config.cdpUrl) {
            platformConfig = {
                platform: 'electron',
                connection: {
                    type: 'cdp',
                    cdpUrl: config.cdpUrl,
                    ...(config.windowTitle && { windowTitle: config.windowTitle })
                },
                prompt: config.prompt
            };
        } else if (config.executablePath) {
            platformConfig = {
                platform: 'electron',
                connection: {
                    type: 'executable',
                    executablePath: config.executablePath,
                    ...(config.launchArgs && { launchArgs: config.launchArgs }),
                    ...(config.windowTitle && { windowTitle: config.windowTitle })
                },
                prompt: config.prompt
            };
        }
        
        writeFileSync(configPath, JSON.stringify({
            platformConfig,
            options: {
                headless: config.headless ?? true,
                maxSteps: config.maxSteps ?? 5,
                vision: config.vision ?? false,
                debugScreenshots: config.screenshots ?? false
            }
        }, null, 2));
        
        const args = [
            'run',
            '--config', configPath
        ];
        
        if (config.url) {
            args.push('--url', config.url);
        }
        
        args.push('--prompt', config.prompt);
        args.push('--steps', String(config.maxSteps ?? 5));
        
        if (!config.headless) {
            args.push('--no-headless');
        }
        
        if (config.vision) {
            args.push('--vision');
        }
        
        if (config.screenshots) {
            args.push('--screenshots');
        }
        
        const result = await spawnCLI(args);
        const duration = Date.now() - startTime;
        
        const output = result.stdout + result.stderr;
        const success = result.exitCode === 0 && (
            output.includes('✓') ||
            output.includes('passed') ||
            output.includes('success') ||
            output.includes('Test completed')
        );
        
        const errors = extractErrors(output);
        
        return {
            success,
            output,
            errors,
            duration,
            exitCode: result.exitCode
        };
        
    } finally {
        if (existsSync(configPath)) {
            unlinkSync(configPath);
        }
    }
}

function spawnCLI(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        
        const cli = spawn('npm', ['run', 'cli', '--', ...args], {
            cwd: process.cwd(),
            env: { ...process.env }
        });
        
        cli.stdout?.on('data', (data) => {
            stdout += data.toString();
            process.stdout.write(data);
        });
        
        cli.stderr?.on('data', (data) => {
            stderr += data.toString();
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
        const app = spawn(appPath, [`--remote-debugging-port=${cdpPort}`], {
            detached: false,
            stdio: 'pipe'
        });
        
        app.stdout?.on('data', (data) => {
            const output = data.toString();
            console.log(`[Electron App] ${output}`);
            
            if (output.includes('ready') || output.includes('started')) {
                resolve(app);
            }
        });
        
        app.stderr?.on('data', (data) => {
            console.error(`[Electron App Error] ${data}`);
        });
        
        app.on('error', (error) => {
            reject(error);
        });
        
        setTimeout(() => resolve(app), 30000);
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
        appPath = './release/mac/Auto-QA.app/Contents/MacOS/Auto-QA';
    } else if (platform === 'win32') {
        appPath = './release/win-unpacked/Auto-QA.exe';
    } else {
        appPath = './release/linux-unpacked/auto-qa';
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
