import { injectable, inject } from 'tsyringe';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { chromium, Browser, Page, ElementHandle } from 'playwright';
import { AgentViewService } from '../../electron/AgentViewService';
import type { IBrowserAutomation, LaunchOptions, Screenshot, ILogger } from '@domain/ports';
import type { Url, ElementId, DOMSnapshot, DOMElement } from '@domain/value-objects';
import { ElementIdFactory } from '@domain/value-objects';
import { NavigationError, InteractionError, SnapshotError, CaptureError } from '@domain/errors';
import { AGENT_VIEW_CONFIG } from '../../../shared/config';

interface RawElement {
    id: number;
    tag: string;
    role: string | null;
    text: string;
    attributes: Record<string, string>;
    isInteractive: boolean;
    boundingBox: { x: number; y: number; width: number; height: number } | null;
}

@injectable()
export class PlaywrightAdapter implements IBrowserAutomation {
    private browser: Browser | null = null;
    private page: Page | null = null;

    constructor(
        @inject(AgentViewService) private agentViewService: AgentViewService,
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
            this.agentViewService.show({
                x: 0,
                y: 0,
                width: AGENT_VIEW_CONFIG.DEFAULT_WIDTH,
                height: AGENT_VIEW_CONFIG.DEFAULT_HEIGHT
            });
            this.logger.debug('[PlaywrightAdapter] AgentView shown');
        }

        const wsEndpoint = await this.agentViewService.getCDPWebSocketURL();
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
        this.agentViewService.hide();
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

        const url = this.page.url();
        const title = await this.page.title();
        const rootClasses = await this.page.evaluate(() => {
            return `html: ${document.documentElement.className} | body: ${document.body.className}`;
        });
        const elements = await this.extractInteractiveElements();

        this.logger.debug(`[PlaywrightAdapter] Snapshot: ${elements.length} elements on ${url}`);
        return { url, title, rootClasses, elements: Object.freeze(elements), timestamp: new Date() };
    }

    private async extractInteractiveElements(): Promise<DOMElement[]> {
        if (!this.page) return [];

        const raw = await this.page.evaluate((): RawElement[] => {
            const selectors = [
                'a', 'button', 'input', 'textarea', 'select',
                '[role="button"]', '[role="link"]', '[role="checkbox"]',
                '[role="radio"]', '[role="textbox"]', '[onclick]',
            ];

            const elements: RawElement[] = [];
            let idCounter = 0;

            function isVisible(el: HTMLElement): boolean {
                const style = getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
            }

            function getTextContent(el: HTMLElement): string {
                return (el.textContent?.trim() || '').slice(0, 100);
            }

            function extractAttrs(el: HTMLElement): Record<string, string> {
                const attrs: Record<string, string> = {};
                ['id', 'name', 'type', 'placeholder', 'aria-label', 'href', 'value'].forEach((attr) => {
                    const val = el.getAttribute(attr);
                    if (val) attrs[attr] = val;
                });
                return attrs;
            }

            for (const selector of selectors) {
                document.querySelectorAll(selector).forEach((node) => {
                    if (!(node instanceof HTMLElement) || !isVisible(node)) return;
                    const id = idCounter++;
                    node.setAttribute('data-autoqa-id', String(id));
                    const rect = node.getBoundingClientRect();
                    elements.push({
                        id,
                        tag: node.tagName.toLowerCase(),
                        role: node.getAttribute('role'),
                        text: getTextContent(node),
                        attributes: extractAttrs(node),
                        isInteractive: true,
                        boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                    });
                });
            }

            return elements;
        });

        return raw.map((el): DOMElement => ({
            id: ElementIdFactory.unsafe(el.id),
            tag: el.tag,
            role: el.role,
            text: el.text,
            attributes: el.attributes,
            isInteractive: el.isInteractive,
            boundingBox: el.boundingBox,
        }));
    }
}
