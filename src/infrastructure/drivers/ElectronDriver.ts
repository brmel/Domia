import { ResultAsync } from 'neverthrow';
import { spawn, ChildProcess } from 'child_process';
import { chromium, Browser } from 'playwright';
import { IAppDriver, AppCapabilities } from '@domain/ports/IAppDriver';
import type { ILogger, IStructuredAutomation } from '@domain/ports';
import { NavigationError } from '@domain/errors';
import { CDP_CONSTANTS } from '@domain/constants/PlatformConstants';
import { CDPValidator } from '@domain/validators/CDPValidator';
import { ElectronWindowManager } from './ElectronWindowManager';
import { ElectronWindowSelectionPolicy } from './ElectronWindowSelectionPolicy';
import { PlaywrightAdapter } from '../playwright/PlaywrightAdapter';
import { retryAsync } from '@shared/reliability/retry';
import { RETRY_PROFILES, isTransientElectronConnectError } from '@shared/reliability/retryProfiles';

export interface ElectronConnectionConfig {
    readonly cdpUrl?: string;
    readonly executablePath?: string;
    readonly launchArgs?: string[];
    readonly connectionTimeout?: number;
    readonly waitForWindow?: boolean;
    readonly windowTitle?: string;
}

export class ElectronDriver implements IAppDriver {
    private browser: Browser | null = null;
    private appProcess: ChildProcess | null = null;
    private readonly windowManager: ElectronWindowManager;

    constructor(
        private readonly windowSelectionPolicy: ElectronWindowSelectionPolicy,
        private readonly logger: ILogger
    ) {
        this.windowManager = new ElectronWindowManager(logger);
    }

    connect(config?: ElectronConnectionConfig): ResultAsync<void, NavigationError | Error> {
        if(config?.executablePath) {
            return ResultAsync.fromPromise(
                this.doLaunch(config),
                (error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    return new NavigationError(`ElectronDriver launch failed: ${message}`);
                }
            );
        }
        
        const cdpUrl = config?.cdpUrl || CDP_CONSTANTS.DEFAULT_URL;
        
        const validation = CDPValidator.validateCDPUrl(cdpUrl);
        if (validation.isErr()) {
            return ResultAsync.fromPromise(
                Promise.reject(validation.error),
                (e) => new NavigationError(`Invalid CDP configuration: ${e}`)
            );
        }

        return ResultAsync.fromPromise(
            this.doConnect({ ...config, cdpUrl: validation.value }),
            (error) => {
                const message = error instanceof Error ? error.message : String(error);
                return new NavigationError(`ElectronDriver connection failed: ${message}`);
            }
        );
    }

    private async doConnect(config: ElectronConnectionConfig): Promise<void> {
        this.logger.info(`[ElectronDriver] Connecting to CDP: ${config.cdpUrl}`);

        try {
            this.browser = await retryAsync(
                async () => chromium.connectOverCDP(config.cdpUrl!, {
                    timeout: config.connectionTimeout || CDP_CONSTANTS.CONNECTION_TIMEOUT_MS
                }),
                {
                    ...RETRY_PROFILES.electronCdpConnect,
                    shouldRetry: (error) => isTransientElectronConnectError(error),
                    onRetry: (info) => {
                        const message = info.error instanceof Error ? info.error.message : String(info.error);
                        this.logger.warn(
                            `[ElectronDriver] Retry ${info.attempt}/${info.maxAttempts - 1} CDP connect after error: ${message}`
                        );
                    }
                }
            );

            this.logger.debug('[ElectronDriver] CDP connection established');
            await this.discoverWindows();

            if (config.waitForWindow !== false && this.windowManager.getWindowCount() === 0) {
                await this.waitForWindow(CDP_CONSTANTS.WINDOW_WAIT_TIMEOUT_MS);
            }

            await this.windowSelectionPolicy.selectTargetWindow(this.windowManager, config.windowTitle);

            this.logger.info(`[ElectronDriver] Connected with ${this.windowManager.getWindowCount()} window(s)`);
        } catch (error) {
            this.logger.error('[ElectronDriver] Connection error:', error);
            throw error;
        }
    }
    
    private async doLaunch(config: ElectronConnectionConfig): Promise<void> {
        this.logger.info(`[ElectronDriver] Launching Electron app: ${config.executablePath}`);
        this.logger.info(`[ElectronDriver] Env Port: ${process.env['ELECTRON_REMOTE_DEBUGGING_PORT']}`);

        try {
            const port = process.env['ELECTRON_REMOTE_DEBUGGING_PORT'];

            if (port) {
                this.logger.info(`[ElectronDriver] Spawning process manually with port ${port}`);

                const env = { ...process.env };
                delete env['ELECTRON_RUN_AS_NODE'];
                delete env['NODE_OPTIONS'];

                this.appProcess = spawn(config.executablePath!, config.launchArgs || [], {
                    env, 
                    detached: false,
                    stdio: 'pipe'
                });

                this.logger.info(`[ElectronDriver] Process spawned with PID: ${this.appProcess.pid}`);

                this.appProcess.stdout?.on('data', (data) => {
                    this.logger.info(`[Electron App] ${data.toString()}`);
                });
                
                this.appProcess.stderr?.on('data', (data) => {
                    this.logger.warn(`[Electron App Err] ${data.toString()}`);
                });

                const cdpUrl = `http://127.0.0.1:${port}`;
                try {
                    this.browser = await retryAsync(
                        async () => chromium.connectOverCDP(cdpUrl, {
                            timeout: config.connectionTimeout || 5000
                        }),
                        {
                            ...RETRY_PROFILES.electronExecutableConnect,
                            shouldRetry: (error) => isTransientElectronConnectError(error),
                            onRetry: (info) => {
                                const message = info.error instanceof Error ? info.error.message : String(info.error);
                                this.logger.debug(
                                    `[ElectronDriver] Waiting for executable CDP (${info.attempt}/${info.maxAttempts - 1}): ${message}`
                                );
                            }
                        }
                    );
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    throw new Error(`Failed to connect to manually spawned Electron app after retries: ${message}`);
                }
            } else {
                const defaultArgs = ['--remote-debugging-port=9222'];

                const args = [
                    ...(config.launchArgs || []),
                    ...(config.launchArgs?.some(a => a.includes('remote-debugging-port')) ? [] : defaultArgs)
                ];

                this.browser = await chromium.launch({
                    executablePath: config.executablePath!,
                    args,
                    timeout: config.connectionTimeout || CDP_CONSTANTS.CONNECTION_TIMEOUT_MS,
                    ignoreDefaultArgs: true
                });
            }

            this.logger.debug('[ElectronDriver] App launched successfully');
            await this.discoverWindows();

            if (config.waitForWindow !== false && this.windowManager.getWindowCount() === 0) {
                await this.waitForWindow(CDP_CONSTANTS.WINDOW_WAIT_TIMEOUT_MS);
            }

            await this.windowSelectionPolicy.selectTargetWindow(this.windowManager, config.windowTitle);

            this.logger.info(`[ElectronDriver] Launched with ${this.windowManager.getWindowCount()} window(s)`);
        } catch (error) {
            this.logger.error('[ElectronDriver] Launch error:', error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        this.logger.info('[ElectronDriver] Disconnecting from Electron app');

        this.windowManager.clear();

        if (this.browser) {
            await this.browser.close().catch(err => {
                this.logger.warn(`[ElectronDriver] Error closing browser: ${err}`);
            });
            this.browser = null;
        }

        if (this.appProcess) {
            this.logger.info('[ElectronDriver] Killing spawned app process');
            this.appProcess.kill();
            this.appProcess = null;
        }
    }

    getCapabilities(): AppCapabilities {
        return {
            platform: 'electron',
            supportsDOM: true,
            supportsVision: true,
            supportsMultiWindow: true,
            supportsNativeInteraction: true // Electron has native menus, dialogs, etc.
        };
    }

    private async discoverWindows(): Promise<void> {
        if (!this.browser) {
            throw new Error('[ElectronDriver] Browser not connected');
        }

        this.windowManager.clear();

        const contexts = this.browser.contexts();

        for (const context of contexts) {
            const pages = context.pages();

            for (const page of pages) {
                const result = await this.windowManager.registerWindow(page);
                if (result.isErr()) {
                    this.logger.warn(`[ElectronDriver] Failed to register window: ${result.error.message}`);
                }
            }
        }

        this.logger.debug(`[ElectronDriver] Discovered ${this.windowManager.getWindowCount()} window(s)`);
    }

    private async waitForWindow(timeoutMs: number): Promise<void> {
        const startTime = Date.now();

        while (this.windowManager.getWindowCount() === 0 && Date.now() - startTime < timeoutMs) {
            await new Promise(resolve => setTimeout(resolve, CDP_CONSTANTS.WINDOW_POLL_INTERVAL_MS));
            await this.discoverWindows();
        }

        if (this.windowManager.getWindowCount() === 0) {
            throw new Error('[ElectronDriver] Timeout waiting for window');
        }
    }

    getAutomation(): IStructuredAutomation {
        const win = this.windowManager.getActiveWindow();
        if (!win) {
             throw new Error('[ElectronDriver] No active window available for browser automation.');
        }

        const adapter = new PlaywrightAdapter(this.logger);
        adapter.setAttachedPage(win.page);
        return adapter;
    }
}
