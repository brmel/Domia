import { spawn, ChildProcess } from 'child_process';
import { chromium, Browser } from 'playwright';
import type { ILogger } from '@domain/ports';
import { CDP_CONSTANTS } from '@domain/constants/PlatformConstants';
import { CDP_DEFAULT_PORT } from '@shared/defaults';
import { RETRY_PROFILES } from '@shared/reliability/retryProfiles';
import { ElectronCDPConnector } from './ElectronCDPConnector';

export interface ElectronLaunchConfig {
    readonly executablePath: string;
    readonly launchArgs?: readonly string[];
    readonly cdpPort?: number;
    readonly connectionTimeout?: number;
}

export class ElectronProcessLauncher {
    private static readonly TAG = '[ElectronProcessLauncher]';

    constructor(
        private readonly cdpConnector: ElectronCDPConnector,
        private readonly logger: ILogger,
    ) {}

    async launch(config: ElectronLaunchConfig): Promise<{ browser: Browser; process: ChildProcess | null }> {
        if (config.cdpPort) {
            return this.launchWithCDP(config);
        }
        return this.launchWithPlaywright(config);
    }

    private async launchWithCDP(config: ElectronLaunchConfig): Promise<{ browser: Browser; process: ChildProcess }> {
        const port = config.cdpPort!;
        this.logger.info(`${ElectronProcessLauncher.TAG} Launching with CDP port ${port}: ${config.executablePath}`);

        const env = { ...process.env };
        delete env['ELECTRON_RUN_AS_NODE'];
        delete env['NODE_OPTIONS'];

        const appProcess = spawn(config.executablePath, [...(config.launchArgs ?? [])], {
            env,
            detached: false,
            stdio: 'pipe',
        });

        this.logger.debug(`${ElectronProcessLauncher.TAG} Process spawned: PID ${appProcess.pid}`);

        appProcess.stdout?.on('data', (data: Buffer) => {
            this.logger.debug(`[ElectronApp] ${data.toString().trimEnd()}`);
        });

        appProcess.stderr?.on('data', (data: Buffer) => {
            this.logger.debug(`[ElectronApp:err] ${data.toString().trimEnd()}`);
        });

        const cdpUrl = `http://127.0.0.1:${port}`;
        try {
            const browser = await this.cdpConnector.connect(
                cdpUrl,
                config.connectionTimeout,
                RETRY_PROFILES.electronExecutableConnect,
            );
            return { browser, process: appProcess };
        } catch (error) {
            appProcess.kill();
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`${ElectronProcessLauncher.TAG} CDP connect failed after launch: ${message}`);
        }
    }

    private async launchWithPlaywright(config: ElectronLaunchConfig): Promise<{ browser: Browser; process: null }> {
        this.logger.info(`${ElectronProcessLauncher.TAG} Launching via Playwright: ${config.executablePath}`);

        const defaultArgs = [`--remote-debugging-port=${CDP_DEFAULT_PORT}`];
        const userArgs = config.launchArgs ?? [];
        const hasPortArg = userArgs.some((a) => a.includes('remote-debugging-port'));

        const browser = await chromium.launch({
            executablePath: config.executablePath,
            args: [...userArgs, ...(hasPortArg ? [] : defaultArgs)],
            timeout: config.connectionTimeout ?? CDP_CONSTANTS.CONNECTION_TIMEOUT_MS,
            ignoreDefaultArgs: true,
        });

        return { browser, process: null };
    }
}
