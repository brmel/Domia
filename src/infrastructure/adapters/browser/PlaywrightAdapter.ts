import { injectable, inject } from 'tsyringe';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { chromium, Browser, Page, ElementHandle } from 'playwright';
import type { IBrowserAutomation, LaunchOptions, Screenshot, ILogger, IViewHost } from '@domain/ports';
import type { Url, ElementId, DOMSnapshot } from '@domain/value-objects';
import { NavigationError, InteractionError, SnapshotError, CaptureError } from '@domain/errors';
import { AGENT_VIEW_CONFIG } from '../../../shared/config';

import { ContextBuilder } from '../../../application/parsers/ContextBuilder';

@injectable()
export class PlaywrightAdapter implements IBrowserAutomation {
    private browser: Browser | null = null;
    private page: Page | null = null;

    constructor(
        @inject('IViewHost') private viewHost: IViewHost,
        @inject(ContextBuilder) private contextBuilder: ContextBuilder,
        @inject('ILogger') private logger: ILogger
    ) { }

    launch(options: LaunchOptions): ResultAsync<void, NavigationError> {
        return ResultAsync.fromPromise(
            this.doLaunch(options),
            (e) => new NavigationError(`Failed to launch browser: ${String(e)}`)
        );
    }

    private async doLaunch(options: LaunchOptions): Promise<void> {
        this.logger.debug('[PlaywrightAdapter] Starting browser launch');

        if (!options.headless) {
            this.viewHost.show({
                x: 0,
                y: 0,
                width: AGENT_VIEW_CONFIG.DEFAULT_WIDTH,
                height: AGENT_VIEW_CONFIG.DEFAULT_HEIGHT
            });
            this.logger.debug('[PlaywrightAdapter] AgentView shown');
        }

        const wsEndpoint = await this.viewHost.getCDPWebSocketURL();
        this.logger.debug(`[PlaywrightAdapter] Connecting to: ${wsEndpoint}`);

        this.browser = await chromium.connectOverCDP({
            endpointURL: wsEndpoint,
            headers: { 'Upgrade': 'websocket' }
        });

        // Create a new context with ignoreHTTPSErrors if not already set by the main process
        // However, connectOverCDP connects to existing browser/contexts.
        // We might need to ensure the main process launches with ignore-certificate-errors
        // OR we can create a new context here if the design allows.
        // But the agent reuses the main window.

        // Actually, for connectOverCDP, we can't easily set ignoreHTTPSErrors for the *existing* context unless the browser was launched with checking disabled.
        // But we can try to use browser.newContext if we were managing our own context.
        // Since we attach to existing pages, the main process (Electron) controls this.

        // Let's check successful connection first.
        const contexts = this.browser.contexts();
        this.logger.debug(`[PlaywrightAdapter] Found ${contexts.length} contexts`);

        for (const ctx of contexts) {
            const pages = ctx.pages();
            this.logger.debug(`[PlaywrightAdapter] Context has ${pages.length} pages`);

            for (const p of pages) {
                const url = p.url();
                this.logger.debug(`[PlaywrightAdapter] Page URL: ${url}`);

                const isMainWindow = url.includes('localhost:') || url.includes('127.0.0.1:5173');
                const isDevTools = url.startsWith('devtools://');
                const isExtension = url.startsWith('chrome-extension://');

                if (!isMainWindow && !isDevTools && !isExtension) {
                    this.page = p;
                    this.logger.info(`[PlaywrightAdapter] Found agent page at: ${url}`);
                    return;
                }
            }
        }

        throw new NavigationError('Could not find agent WebContentsView page');
    }

    navigateTo(url: Url): ResultAsync<void, NavigationError> {
        if (!this.page) {
            return errAsync(new NavigationError('Browser not launched'));
        }
        this.logger.debug(`[PlaywrightAdapter] Navigating to: ${url}`);
        return ResultAsync.fromPromise(
            this.page.goto(url, { waitUntil: 'domcontentloaded' }),
            (e) => new NavigationError(`Navigation failed: ${String(e)}`)
        ).map(() => {
            this.logger.debug('[PlaywrightAdapter] Navigation complete');
            return undefined;
        });
    }

    click(elementId: ElementId): ResultAsync<void, InteractionError> {
        this.logger.debug(`[PlaywrightAdapter] Clicking element: ${elementId}`);
        return this.findElement(elementId).andThen((el) =>
            ResultAsync.fromPromise(
                el.click(),
                (e) => new InteractionError(`Click failed: ${String(e)}`, elementId)
            )
        );
    }

    type(elementId: ElementId, text: string): ResultAsync<void, InteractionError> {
        this.logger.debug(`[PlaywrightAdapter] Typing into element: ${elementId}`);
        return this.findElement(elementId).andThen((el) =>
            ResultAsync.fromPromise(
                el.fill(text),
                (e) => new InteractionError(`Type failed: ${String(e)}`, elementId)
            )
        );
    }

    pressKey(key: string): ResultAsync<void, InteractionError> {
        if (!this.page) {
            return errAsync(new InteractionError('Browser not launched'));
        }
        this.logger.debug(`[PlaywrightAdapter] Pressing key: ${key}`);
        return ResultAsync.fromPromise(
            this.page.keyboard.press(key),
            (e) => new InteractionError(`Press key failed: ${String(e)}`)
        );
    }

    scroll(direction: 'up' | 'down'): ResultAsync<void, InteractionError> {
        if (!this.page) {
            return errAsync(new InteractionError('Browser not launched'));
        }
        this.logger.debug(`[PlaywrightAdapter] Scrolling: ${direction}`);
        const delta = direction === 'down' ? 500 : -500;
        return ResultAsync.fromPromise(
            this.page.mouse.wheel(0, delta),
            (e) => new InteractionError(`Scroll failed: ${String(e)}`)
        );
    }

    wait(durationMs: number): ResultAsync<void, InteractionError> {
        if (!this.page) {
            return errAsync(new InteractionError('Browser not launched'));
        }
        return ResultAsync.fromPromise(
            this.page.waitForTimeout(durationMs),
            (e) => new InteractionError(`Wait failed: ${String(e)}`)
        );
    }

    snapshot(): ResultAsync<DOMSnapshot, SnapshotError> {
        if (!this.page) {
            return errAsync(new SnapshotError('Browser not launched'));
        }
        return ResultAsync.fromPromise(
            this.extractSnapshot(),
            (e) => new SnapshotError(`Snapshot failed: ${String(e)}`)
        );
    }

    screenshot(): ResultAsync<Screenshot, CaptureError> {
        if (!this.page) {
            return errAsync(new CaptureError('Browser not launched'));
        }
        return ResultAsync.fromPromise(
            this.page.screenshot({ fullPage: false }),
            (e) => new CaptureError(`Screenshot failed: ${String(e)}`)
        ).map((data) => ({ data, timestamp: new Date() }));
    }

    async getViewportSize(): Promise<{ width: number; height: number }> {
        if (!this.page) {
            return { width: AGENT_VIEW_CONFIG.DEFAULT_WIDTH, height: AGENT_VIEW_CONFIG.DEFAULT_HEIGHT };
        }
        const size = this.page.viewportSize();
        return size ?? { width: AGENT_VIEW_CONFIG.DEFAULT_WIDTH, height: AGENT_VIEW_CONFIG.DEFAULT_HEIGHT };
    }

    async waitForDOMStable(timeout: number = 2000): Promise<void> {
        if (!this.page) return;
        try {
            await this.page.waitForLoadState('networkidle', { timeout });
        } catch {
            // Timeout acceptable
        }
        await this.page.waitForTimeout(100);
    }

    async close(): Promise<void> {
        this.logger.debug('[PlaywrightAdapter] Closing browser');
        this.viewHost.hide();
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
        this.page = null;
    }

    private findElement(elementId: ElementId): ResultAsync<ElementHandle, InteractionError> {
        if (!this.page) {
            return errAsync(new InteractionError('Browser not launched', elementId));
        }
        return ResultAsync.fromPromise(
            this.page.locator(`[data-autoqa-id="${elementId}"]`).elementHandle(),
            (e) => new InteractionError(`Element not found: ${String(e)}`, elementId)
        ).andThen((el) =>
            el ? okAsync(el) : errAsync(new InteractionError('Element not found', elementId))
        );
    }

    private async extractSnapshot(): Promise<DOMSnapshot> {
        if (!this.page) throw new SnapshotError('Page not available');
        return this.contextBuilder.buildSnapshot(this.page);
    }
}
