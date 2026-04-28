import { ResultAsync, errAsync } from 'neverthrow';
import { chromium, Browser } from 'playwright';
import { spawn, type ChildProcess } from 'child_process';
import { IAppDriver, AppCapabilities } from '@domain/ports/IAppDriver';
import type { ILogger, IStructuredAutomation } from '@domain/ports';
import { NavigationError } from '@domain/errors';
import { CDP_DEFAULT_URL, CDP_DEFAULT_PORT, CDP_CONNECTION_TIMEOUT_MS, WINDOW_WAIT_TIMEOUT_MS, WINDOW_POLL_INTERVAL_MS } from '@shared/defaults';
import { CDPValidator } from '@domain/CDPValidator';
import { retryAsync } from '@shared/reliability/retry';
import { RETRY_PROFILES, isTransientElectronConnectError } from '@shared/reliability/retryProfiles';
import { sleep } from '@shared/reliability/sleep';
import type { RetryOptions } from '@shared/reliability/retry';
import { ElectronWindowManager } from './ElectronWindowManager';
import { ElectronWindowSelectionPolicy } from './ElectronWindowSelectionPolicy';
import { PlaywrightAdapter } from '../PlaywrightAdapter';
import { PlaywrightSampler } from '../observation/PlaywrightSampler';
import { PlaywrightStream } from '../observation/PlaywrightStream';
import type { ObservationFactoryDeps } from '@domain/ports/IAppDriver';
import type { IObservationSampler } from '@domain/ports/IObservationSampler';
import type { IObservationStream } from '@domain/ports/IObservationStream';

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

    constructor(
        private readonly windowSelectionPolicy: ElectronWindowSelectionPolicy,
        private readonly logger: ILogger,
    ) {
        this.windowManager = new ElectronWindowManager(logger);
    }

    connect(config?: ElectronConnectionConfig): ResultAsync<void, NavigationError | Error> {
        if (config?.executablePath) {
            return ResultAsync.fromPromise(
                this.doLaunch(config),
                (e) => new NavigationError(`ElectronDriver launch failed: ${e instanceof Error ? e.message : String(e)}`),
            );
        }

        const cdpUrl = config?.cdpUrl ?? CDP_DEFAULT_URL;
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
        this.browser = await this.connectCDP(
            config.cdpUrl!,
            config.connectionTimeout,
        );
        await this.initializeWindows(config);
        this.logger.info(`${ElectronDriver.TAG} Connected with ${this.windowManager.getWindowCount()} window(s)`);
    }

    private async doLaunch(config: ElectronConnectionConfig): Promise<void> {
        if (config.cdpPort) {
            const { browser, process: proc } = await this.launchWithCDP(config);
            this.browser = browser;
            this.appProcess = proc;
        } else {
            this.browser = await this.launchWithPlaywright(config);
        }
        await this.initializeWindows(config);
        this.logger.info(`${ElectronDriver.TAG} Launched with ${this.windowManager.getWindowCount()} window(s)`);
    }

    private async connectCDP(cdpUrl: string, timeoutMs?: number, retryProfile?: RetryOptions): Promise<Browser> {
        const timeout = timeoutMs ?? CDP_CONNECTION_TIMEOUT_MS;
        const profile = retryProfile ?? RETRY_PROFILES.electronCdpConnect;
        this.logger.info(`${ElectronDriver.TAG} Connecting to CDP: ${cdpUrl}`);

        const browser = await retryAsync(
            async () => chromium.connectOverCDP(cdpUrl, { timeout }),
            {
                ...profile,
                shouldRetry: (error) => isTransientElectronConnectError(error),
                onRetry: (info) => {
                    const message = info.error instanceof Error ? info.error.message : String(info.error);
                    this.logger.debug(`${ElectronDriver.TAG} CDP retry ${info.attempt}/${info.maxAttempts - 1}: ${message}`);
                },
            },
        );
        this.logger.debug(`${ElectronDriver.TAG} CDP connected`);
        return browser;
    }

    private async launchWithCDP(config: ElectronConnectionConfig): Promise<{ browser: Browser; process: ChildProcess }> {
        const port = config.cdpPort!;
        this.logger.info(`${ElectronDriver.TAG} Launching with CDP port ${port}: ${config.executablePath}`);

        const env = { ...process.env };
        delete env['ELECTRON_RUN_AS_NODE'];
        delete env['NODE_OPTIONS'];

        const appProcess = spawn(config.executablePath!, [...(config.launchArgs ?? [])], {
            env,
            detached: false,
            stdio: 'pipe',
        });

        this.logger.debug(`${ElectronDriver.TAG} Process spawned: PID ${appProcess.pid}`);

        appProcess.stdout?.on('data', (data: Buffer) => {
            this.logger.debug(`[ElectronApp] ${data.toString().trimEnd()}`);
        });
        appProcess.stderr?.on('data', (data: Buffer) => {
            this.logger.debug(`[ElectronApp:err] ${data.toString().trimEnd()}`);
        });

        const cdpUrl = `http://127.0.0.1:${port}`;
        try {
            const browser = await this.connectCDP(cdpUrl, config.connectionTimeout, RETRY_PROFILES.electronExecutableConnect);
            return { browser, process: appProcess };
        } catch (error) {
            appProcess.kill();
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`${ElectronDriver.TAG} CDP connect failed after launch: ${message}`);
        }
    }

    private async launchWithPlaywright(config: ElectronConnectionConfig): Promise<Browser> {
        if (!config.executablePath) {
            throw new Error(`${ElectronDriver.TAG} executablePath is required to launch via Playwright`);
        }
        this.logger.info(`${ElectronDriver.TAG} Launching via Playwright: ${config.executablePath}`);

        const defaultArgs = [`--remote-debugging-port=${CDP_DEFAULT_PORT}`];
        const userArgs = config.launchArgs ?? [];
        const hasPortArg = userArgs.some((a) => a.includes('remote-debugging-port'));

        return chromium.launch({
            executablePath: config.executablePath,
            args: [...userArgs, ...(hasPortArg ? [] : defaultArgs)],
            timeout: config.connectionTimeout ?? CDP_CONNECTION_TIMEOUT_MS,
            ignoreDefaultArgs: true,
        });
    }

    private async initializeWindows(config: ElectronConnectionConfig): Promise<void> {
        await this.discoverWindows();

        if (config.waitForWindow !== false && this.windowManager.getWindowCount() === 0) {
            await this.waitForWindow(WINDOW_WAIT_TIMEOUT_MS);
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

    getSessionExtras(): Readonly<Record<string, unknown>> {
        return { windowManager: this.windowManager };
    }

    createObservationSampler(deps: ObservationFactoryDeps): IObservationSampler {
        const automation = this.getAutomation() as PlaywrightAdapter;
        const source = automation.getPerceptionSource();
        if (!source) throw new Error(`${ElectronDriver.TAG} Cannot create sampler before window is open`);
        return new PlaywrightSampler(deps.perception, source, deps.vision);
    }

    createObservationStream(): IObservationStream {
        const automation = this.getAutomation() as PlaywrightAdapter;
        return new PlaywrightStream(() => automation.getPlaywrightPage(), this.logger);
    }

    switchToWindow(windowId: string): void {
        const win = this.windowManager.getWindow(windowId);
        if (win.isErr()) {
            throw new Error(`${ElectronDriver.TAG} ${win.error.message}`);
        }

        // switchWindow is async (bringToFront), but callers don't await — fire-and-forget the focus
        void this.windowManager.switchWindow(windowId, this.adapter ?? undefined);
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
            await sleep(WINDOW_POLL_INTERVAL_MS);
            await this.discoverWindows();
        }

        if (this.windowManager.getWindowCount() === 0) {
            throw new Error(`${ElectronDriver.TAG} Timeout waiting for window`);
        }
    }
}
