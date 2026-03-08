import { injectable, inject } from 'tsyringe';
import { chromium, type Browser } from 'playwright';
import type { ILogger } from '@domain/ports';
import { BROWSER_IDLE_TIMEOUT_MS, CHROMIUM_LAUNCH_ARGS } from '@shared/defaults';

@injectable()
export class BrowserPool {
    private browser: Browser | null = null;
    private idleTimer: ReturnType<typeof setTimeout> | null = null;
    private lastHeadless: boolean | null = null;

    constructor(@inject('ILogger') private readonly logger: ILogger) {}

    async acquire(headless: boolean): Promise<Browser> {
        this.clearIdleTimer();

        if (this.browser?.isConnected() && this.lastHeadless === headless) {
            this.logger.debug('[BrowserPool] Reusing warm browser');
            return this.browser;
        }

        if (this.browser?.isConnected()) {
            this.logger.debug('[BrowserPool] Headless mode changed, closing old browser');
            await this.browser.close().catch(e => this.logger.debug('[BrowserPool] Close failed during mode change: %s', e));
        }

        this.logger.info('[BrowserPool] Launching new browser');
        this.browser = await chromium.launch({ headless, args: [...CHROMIUM_LAUNCH_ARGS] });
        this.lastHeadless = headless;

        this.browser.on('disconnected', () => {
            this.logger.debug('[BrowserPool] Browser disconnected');
            this.browser = null;
            this.lastHeadless = null;
            this.clearIdleTimer();
        });

        return this.browser;
    }

    release(): void {
        this.clearIdleTimer();
        this.idleTimer = setTimeout(() => {
            void this.close();
        }, BROWSER_IDLE_TIMEOUT_MS);
    }

    async close(): Promise<void> {
        this.clearIdleTimer();
        if (this.browser?.isConnected()) {
            this.logger.debug('[BrowserPool] Closing browser');
            await this.browser.close().catch(e => this.logger.debug('[BrowserPool] Close failed during shutdown: %s', e));
        }
        this.browser = null;
        this.lastHeadless = null;
    }

    private clearIdleTimer(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }
}
