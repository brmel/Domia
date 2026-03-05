import { ResultAsync, errAsync } from 'neverthrow';
import { Browser } from 'playwright';
import type { ChildProcess } from 'child_process';
import { IAppDriver, AppCapabilities } from '@domain/ports/IAppDriver';
import type { ILogger, IStructuredAutomation } from '@domain/ports';
import { NavigationError } from '@domain/errors';
import { CDP_CONSTANTS } from '@domain/constants/PlatformConstants';
import { CDPValidator } from '@domain/validators/CDPValidator';
import { ElectronWindowManager } from './ElectronWindowManager';
import { ElectronWindowSelectionPolicy } from './ElectronWindowSelectionPolicy';
import { ElectronCDPConnector } from './ElectronCDPConnector';
import { ElectronProcessLauncher } from './ElectronProcessLauncher';
import { PlaywrightAdapter } from '../playwright/PlaywrightAdapter';

export interface ElectronConnectionConfig {
    readonly cdpUrl?: string;
    readonly executablePath?: string;
    readonly launchArgs?: readonly string[];
    readonly cdpPort?: number;
    readonly connectionTimeout?: number;
    readonly waitForWindow?: boolean;
    readonly windowTitle?: string;
}

export class ElectronDriver implements IAppDriver {
    private static readonly TAG = '[ElectronDriver]';

    private browser: Browser | null = null;
    private appProcess: ChildProcess | null = null;
    private adapter: PlaywrightAdapter | null = null;
    readonly windowManager: ElectronWindowManager;
    private readonly cdpConnector: ElectronCDPConnector;
    private readonly processLauncher: ElectronProcessLauncher;

    constructor(
        private readonly windowSelectionPolicy: ElectronWindowSelectionPolicy,
        private readonly logger: ILogger,
    ) {
        this.windowManager = new ElectronWindowManager(logger);
        this.cdpConnector = new ElectronCDPConnector(logger);
        this.processLauncher = new ElectronProcessLauncher(this.cdpConnector, logger);
    }

    connect(config?: ElectronConnectionConfig): ResultAsync<void, NavigationError | Error> {
        if (config?.executablePath) {
            return ResultAsync.fromPromise(
                this.doLaunch(config),
                (e) => new NavigationError(`ElectronDriver launch failed: ${e instanceof Error ? e.message : String(e)}`),
            );
        }

        const cdpUrl = config?.cdpUrl ?? CDP_CONSTANTS.DEFAULT_URL;
        const validation = CDPValidator.validateCDPUrl(cdpUrl);
        if (validation.isErr()) {
            return errAsync(new NavigationError(`Invalid CDP configuration: ${validation.error.message}`));
        }

        return ResultAsync.fromPromise(
            this.doConnect({ ...config, cdpUrl: validation.value }),
            (e) => new NavigationError(`ElectronDriver connection failed: ${e instanceof Error ? e.message : String(e)}`),
        );
    }

    private async doConnect(config: ElectronConnectionConfig): Promise<void> {
        this.browser = await this.cdpConnector.connect(
            config.cdpUrl!,
            config.connectionTimeout,
        );
        await this.initializeWindows(config);
        this.logger.info(`${ElectronDriver.TAG} Connected with ${this.windowManager.getWindowCount()} window(s)`);
    }

    private async doLaunch(config: ElectronConnectionConfig): Promise<void> {
        const result = await this.processLauncher.launch({
            executablePath: config.executablePath!,
            ...(config.launchArgs ? { launchArgs: [...config.launchArgs] } : {}),
            ...(config.cdpPort !== undefined ? { cdpPort: config.cdpPort } : {}),
            ...(config.connectionTimeout !== undefined ? { connectionTimeout: config.connectionTimeout } : {}),
        });
        this.browser = result.browser;
        this.appProcess = result.process;
        await this.initializeWindows(config);
        this.logger.info(`${ElectronDriver.TAG} Launched with ${this.windowManager.getWindowCount()} window(s)`);
    }

    private async initializeWindows(config: ElectronConnectionConfig): Promise<void> {
        await this.discoverWindows();

        if (config.waitForWindow !== false && this.windowManager.getWindowCount() === 0) {
            await this.waitForWindow(CDP_CONSTANTS.WINDOW_WAIT_TIMEOUT_MS);
        }

        await this.windowSelectionPolicy.selectTargetWindow(this.windowManager, config.windowTitle);
        this.buildAdapter();
    }

    private buildAdapter(): void {
        const win = this.windowManager.getActiveWindow();
        if (!win) return;

        this.adapter = new PlaywrightAdapter(this.logger);
        this.adapter.setAttachedPage(win.page);
    }

    async disconnect(): Promise<void> {
        this.logger.info(`${ElectronDriver.TAG} Disconnecting`);
        this.adapter = null;
        this.windowManager.reset();

        if (this.browser) {
            await this.browser.close().catch((e) => {
                this.logger.warn(`${ElectronDriver.TAG} Error closing browser: ${e}`);
            });
            this.browser = null;
        }

        if (this.appProcess) {
            this.logger.debug(`${ElectronDriver.TAG} Killing spawned process`);
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
            supportsNativeInteraction: true,
        };
    }

    getAutomation(): IStructuredAutomation {
        if (this.adapter) return this.adapter;

        const win = this.windowManager.getActiveWindow();
        if (!win) {
            throw new Error(`${ElectronDriver.TAG} No active window available`);
        }

        this.adapter = new PlaywrightAdapter(this.logger);
        this.adapter.setAttachedPage(win.page);
        return this.adapter;
    }

    switchToWindow(windowId: string): void {
        const result = this.windowManager.setActiveWindow(windowId);
        if (result.isErr()) {
            throw new Error(`${ElectronDriver.TAG} ${result.error.message}`);
        }

        const win = this.windowManager.getActiveWindow();
        if (!win) {
            throw new Error(`${ElectronDriver.TAG} Window ${windowId} not found after switch`);
        }

        this.adapter = new PlaywrightAdapter(this.logger);
        this.adapter.setAttachedPage(win.page);
        this.logger.info(`${ElectronDriver.TAG} Switched to window: ${windowId}`);
    }

    async refreshWindows(): Promise<void> {
        await this.discoverWindows();
    }

    private async discoverWindows(): Promise<void> {
        if (!this.browser) {
            throw new Error(`${ElectronDriver.TAG} Browser not connected`);
        }

        this.windowManager.reset();

        for (const context of this.browser.contexts()) {
            for (const page of context.pages()) {
                const result = await this.windowManager.registerWindow(page);
                if (result.isErr()) {
                    this.logger.warn(`${ElectronDriver.TAG} Failed to register window: ${result.error.message}`);
                }
            }
        }

        this.logger.debug(`${ElectronDriver.TAG} Discovered ${this.windowManager.getWindowCount()} window(s)`);
    }

    private async waitForWindow(timeoutMs: number): Promise<void> {
        const startTime = Date.now();

        while (this.windowManager.getWindowCount() === 0 && Date.now() - startTime < timeoutMs) {
            await new Promise((resolve) => setTimeout(resolve, CDP_CONSTANTS.WINDOW_POLL_INTERVAL_MS));
            await this.discoverWindows();
        }

        if (this.windowManager.getWindowCount() === 0) {
            throw new Error(`${ElectronDriver.TAG} Timeout waiting for window`);
        }
    }
}
