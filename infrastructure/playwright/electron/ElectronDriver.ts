import { ResultAsync, errAsync } from 'neverthrow';
import type { Browser } from 'playwright';
import type { ChildProcess } from 'child_process';
import { IAppDriver, AppCapabilities } from '@domain/ports/automation/IAppDriver';
import type { ILogger, IStructuredAutomation } from '@domain/ports';
import type { AgentRuntimeExtras } from '@domain/ports/agent/IAgentRuntime';
import type { IWindowManager } from '@domain/ports/automation/IWindowManager';
import { NavigationError } from '@domain/errors';
import { CDP_DEFAULT_URL, WINDOW_WAIT_TIMEOUT_MS, WINDOW_POLL_INTERVAL_MS } from '@shared/defaults';
import { CDPValidator } from '@domain/CDPValidator';
import { Platform } from '@domain/value-objects';
import { sleep } from '@shared/reliability/sleep';
import { connectCDP, launchWithCDP, type ElectronConnectionConfig } from './electronCdpConnect';
import { ElectronWindowManager } from './ElectronWindowManager';
import { ElectronWindowSelectionPolicy } from './ElectronWindowSelectionPolicy';
import { PlaywrightAdapter } from '../PlaywrightAdapter';
import { PlaywrightSampler } from '../observation/PlaywrightSampler';
import { PlaywrightStream } from '../observation/PlaywrightStream';
import type { ObservationFactoryDeps } from '@domain/ports/automation/IAppDriver';
import type { IObservationSampler } from '@domain/ports/perception/IObservationSampler';
import type { IObservationStream } from '@domain/ports/perception/IObservationStream';

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
            this.doConnect(validation.value, config ?? {}),
            (e) => new NavigationError(`ElectronDriver connection failed: ${e instanceof Error ? e.message : String(e)}`),
        );
    }

    private async doConnect(cdpUrl: string, config: ElectronConnectionConfig): Promise<void> {
        this.browser = await connectCDP(this.logger, cdpUrl, config.connectionTimeout);
        await this.initializeWindows(config);
        this.logger.info(`${ElectronDriver.TAG} Connected with ${this.windowManager.getWindowCount()} window(s)`);
    }

    private async doLaunch(config: ElectronConnectionConfig): Promise<void> {
        const { browser, process: proc } = await launchWithCDP(this.logger, config);
        this.browser = browser;
        this.appProcess = proc;
        await this.initializeWindows(config);
        this.logger.info(`${ElectronDriver.TAG} Launched with ${this.windowManager.getWindowCount()} window(s)`);
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
            platform: Platform.Electron,
            supportsDOM: true,
            supportsVision: true,
            supportsMultiWindow: true,
            supportsNativeInteraction: true,
        };
    }

    getAutomation(): IStructuredAutomation {
        if (!this.adapter) this.buildAdapter();
        if (!this.adapter) {
            throw new Error(`${ElectronDriver.TAG} No active window available`);
        }
        return this.adapter;
    }

    getSessionExtras(): AgentRuntimeExtras {
        const wm = this.windowManager;
        const windowManager: IWindowManager = {
            getAllWindows: () => wm.getAllWindows(),
            getActiveWindow: () => wm.getActiveWindow(),
            switchWindow: (windowId) =>
                // Pass the live adapter so the switch re-attaches the shared automation
                // surface (and, via the lazy perception source, observations) to the new window.
                wm.switchWindow(windowId, this.adapter ?? undefined).then((r) => r.map((w) => ({ id: w.id, title: w.title, url: w.url }))),
        };
        return { windowManager };
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
