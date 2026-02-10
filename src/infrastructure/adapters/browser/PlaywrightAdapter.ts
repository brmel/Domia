import { injectable, inject } from 'tsyringe';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { chromium, Browser, Page, ElementHandle, CDPSession } from 'playwright';
import type { IBrowserAutomation, LaunchOptions, Screenshot, ILogger, IViewHost } from '@domain/ports';
import type { Url, ElementId, DOMSnapshot } from '@domain/value-objects';
import { NavigationError, InteractionError, SnapshotError, CaptureError } from '@domain/errors';
import { AGENT_VIEW_CONFIG } from '../../../shared/config';

import { ContextBuilder } from '../../parsers/ContextBuilder';

@injectable()
export class PlaywrightAdapter implements IBrowserAutomation {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private cdpSession: CDPSession | null = null;

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
            // Let the frontend (LiveViewContainer) control visibility and bounds
            this.logger.debug('[PlaywrightAdapter] Adapting view for headless: false');
        }

        let wsEndpoint: string | null = null;
        try {
            wsEndpoint = await this.viewHost.getCDPWebSocketURL();
        } catch (error) {
            this.logger.debug('[PlaywrightAdapter] ViewHost does not support CDP, falling back to standalone launch');
        }

        if (wsEndpoint) {
            this.logger.debug(`[PlaywrightAdapter] Connecting to: ${wsEndpoint}`);
            this.browser = await chromium.connectOverCDP({
                endpointURL: wsEndpoint,
                headers: { 'Upgrade': 'websocket' }
            });

            // Find existing page in Electron
            const contexts = this.browser.contexts();
            for (const ctx of contexts) {
                const pages = ctx.pages();
                for (const p of pages) {
                    const url = p.url();
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
        } else {
            // Standalone Launch (CLI / Headless)
            this.logger.info('[PlaywrightAdapter] Launching standalone browser');
            this.browser = await chromium.launch({
                headless: options.headless,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const context = await this.browser.newContext({
                ignoreHTTPSErrors: true
            });
            this.page = await context.newPage();
            this.logger.info('[PlaywrightAdapter] Created new page');
        }
    }

    navigateTo(url: Url): ResultAsync<void, NavigationError> {
        if (!this.page) {
            return errAsync(new NavigationError('Browser not launched'));
        }
        this.logger.debug(`[PlaywrightAdapter] Navigating to: ${url}`);
        return ResultAsync.fromPromise(
            this.page.goto(url, { waitUntil: 'load', timeout: 30000 }),
            (e) => new NavigationError(`Navigation failed: ${String(e)}`)
        ).andThen(() => ResultAsync.fromPromise(this.waitForDOMStable(), e => new NavigationError(String(e))));
    }

    click(elementId: ElementId, options?: { force?: boolean; timeout?: number }): ResultAsync<void, InteractionError> {
        this.logger.debug(`[PlaywrightAdapter] Clicking element: ${elementId}${options?.force ? ' (forced)' : ''}`);

        return this.findElement(elementId).andThen((el) => {
            const clickOptions = {
                force: options?.force ?? false,
                timeout: options?.timeout ?? 10000 // 10s default instead of 30s
            };

            const attempt = (): ResultAsync<void, InteractionError> => ResultAsync.fromPromise(
                el.click(clickOptions),
                (e) => new InteractionError(`Click failed: ${String(e)}`, elementId)
            );

            return attempt().orElse((err) => {
                if (!options?.force && (err.message.includes('intercepts pointer events') || err.message.includes('Timeout'))) {
                    this.logger.warn(`[PlaywrightAdapter] Click on ${elementId} intercepted or timed out, retrying with force: true`);
                    return ResultAsync.fromPromise(
                        el.click({ ...clickOptions, force: true }),
                        (e) => new InteractionError(`Force click failed: ${String(e)}`, elementId)
                    );
                }
                return errAsync(err);
            });
        });
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

    highlight(elementId: ElementId): ResultAsync<void, InteractionError> {
        return this.findElement(elementId).andThen((el) =>
            ResultAsync.fromPromise(
                (async (): Promise<void> => {
                    await el.scrollIntoViewIfNeeded();

                    await el.evaluate((node) => {
                        const element = node as HTMLElement;
                        const originalOutline = element.style.outline;
                        const originalTransition = element.style.transition;

                        element.style.transition = 'outline 0.1s ease-in-out';
                        element.style.outline = '3px solid #ff0000';
                        element.style.outlineOffset = '2px';

                        setTimeout(() => {
                            element.style.outline = originalOutline;
                            element.style.transition = originalTransition;
                        }, 1000);
                    });

                    if (this.page) {
                        await this.page.waitForTimeout(500);
                    }
                })(),
                (e) => new InteractionError(`Highlight failed: ${String(e)}`, elementId)
            )
        );
    }

    extractText(elementId: ElementId): ResultAsync<string, InteractionError> {
        this.logger.debug(`[PlaywrightAdapter] Extracting text from: ${elementId}`);
        return this.findElement(elementId).andThen((el) =>
            ResultAsync.fromPromise(
                el.innerText(),
                (e) => new InteractionError(`Extract text failed: ${String(e)}`, elementId)
            )
        ).map(text => text ?? '');
    }

    snapshot(): ResultAsync<DOMSnapshot, SnapshotError> {
        if (!this.page) {
            return errAsync(new SnapshotError('Browser not launched'));
        }
        return ResultAsync.fromPromise(
            (async (): Promise<DOMSnapshot> => {
                await this.waitForDOMStable();
                return this.extractSnapshot();
            })(),
            (e) => new SnapshotError(`Snapshot failed: ${String(e)}`)
        );
    }

    snapshotAria(): ResultAsync<import('@domain/value-objects/AriaNode').AriaNode, SnapshotError> {
        if (!this.page) {
            return errAsync(new SnapshotError('Browser not launched'));
        }
        // Playwright Page type definition might differ from actual runtime or local declaration
        const pageWithAccessibility = this.page as unknown as { accessibility: { snapshot: (options: { interestingOnly: boolean }) => Promise<unknown> } };

        if (!pageWithAccessibility.accessibility) {
            return errAsync(new SnapshotError('Page accessibility API not available'));
        }

        return ResultAsync.fromPromise(
            pageWithAccessibility.accessibility.snapshot({ interestingOnly: false }) as Promise<import('@domain/value-objects/AriaNode').AriaNode>,
            (e) => new SnapshotError(`Aria snapshot failed: ${String(e)}`)
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

    async waitForDOMStable(timeout: number = 5000): Promise<void> {
        if (!this.page) return;
        this.logger.debug('[PlaywrightAdapter] Waiting for DOM stability');
        try {
            await Promise.all([
                this.page.waitForLoadState('load', { timeout }),
                this.page.waitForLoadState('networkidle', { timeout }).catch(() => {
                    this.logger.debug('[PlaywrightAdapter] Network idle timeout, proceeding anyway');
                })
            ]);
        } catch (e) {
            this.logger.debug(`[PlaywrightAdapter] Wait for stable failed or timed out: ${String(e)}`);
        }
        await this.page.waitForTimeout(500);
    }

    async close(): Promise<void> {
        this.logger.debug('[PlaywrightAdapter] Closing browser context');

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

    pause(): ResultAsync<void, Error> {
        if (!this.page) return errAsync(new Error('Browser not launched'));

        return ResultAsync.fromPromise(
            (async () => {
                if (!this.cdpSession) {
                    this.cdpSession = await this.page!.context().newCDPSession(this.page!);
                }
                await this.cdpSession.send('Debugger.enable');
                await this.cdpSession.send('Debugger.pause');
            })(),
            (error) => new Error(`Failed to pause execution: ${String(error)}`)
        );
    }

    resume(): ResultAsync<void, Error> {
        if (!this.cdpSession) return okAsync(undefined);

        return ResultAsync.fromPromise(
            (async () => {
                const session = this.cdpSession;
                if (!session) return;

                try {
                    await session.send('Debugger.resume');
                } catch (e) {
                    // Ignore errors if already resumed or session closed
                    // We must proceed to disable debugger
                } finally {
                    try {
                        await session.send('Debugger.disable');
                    } catch (e) {
                        // Ignore disable errors
                    }
                }
            })(),
            (error) => new Error(`Failed to resume execution: ${String(error)}`)
        );
    }

    private async extractSnapshot(): Promise<DOMSnapshot> {
        if (!this.page) throw new SnapshotError('Page not available');
        return this.contextBuilder.buildSnapshot(this.page);
    }
}
