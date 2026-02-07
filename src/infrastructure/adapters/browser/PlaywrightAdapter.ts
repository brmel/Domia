import { injectable, inject } from 'tsyringe';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import {
    chromium,
    Browser,
    BrowserContext,
    Page,
    ElementHandle,
} from 'playwright';
import { AgentViewService } from '../../electron/AgentViewService';
import type {
    IBrowserAutomation,
    LaunchOptions,
    Screenshot,
} from '@domain/ports';
import type { Url, ElementId, DOMSnapshot, DOMElement } from '@domain/value-objects';
import {
    NavigationError,
    InteractionError,
    SnapshotError,
    CaptureError,
} from '@domain/errors';

/**
 * PlaywrightAdapter
 * Implements IBrowserAutomation port using Playwright
 */
@injectable()
export class PlaywrightAdapter implements IBrowserAutomation {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;

    constructor(
        @inject(AgentViewService) private agentViewService: AgentViewService
    ) { }

    launch(options: LaunchOptions): ResultAsync<void, NavigationError> {
        return ResultAsync.fromPromise(
            this.doLaunch(options),
            (e) => new NavigationError(`Failed to launch browser: ${String(e)}`)
        );
    }

    private async doLaunch(options: LaunchOptions): Promise<void> {
        // Show the native view
        // Default bounds, will be resized by UI later
        if (!options.headless) {
            this.agentViewService.show({ x: 0, y: 0, width: 1200, height: 800 });
        }

        // Connect via CDP
        const wsEndpoint = await this.agentViewService.getCDPWebSocketURL();
        this.browser = await chromium.connectOverCDP({
            endpointURL: wsEndpoint,
        });

        // When connecting over CDP to an Electron WebContents, 
        // the browser context is already there (default context).
        this.context = this.browser.contexts()[0] || null;

        // We need to find the page. WebContentsView creates a page.
        // If there are multiple, we might need logic to pick the right one.
        // Usually the first one or we can filter.
        this.page = this.context?.pages()[0] || null;

        if (!this.page) {
            // New context might not have a page yet? 
            // WebContentsView definitely has one.
            // Maybe wait a bit?
            throw new Error('No page found in connected context');
        }
    }

    navigateTo(url: Url): ResultAsync<void, NavigationError> {
        if (!this.page) {
            return errAsync(new NavigationError('Browser not launched'));
        }
        return ResultAsync.fromPromise(
            this.page.goto(url, { waitUntil: 'domcontentloaded' }),
            (e) => new NavigationError(`Navigation failed: ${String(e)}`)
        ).map(() => undefined);
    }

    click(elementId: ElementId): ResultAsync<void, InteractionError> {
        return this.findElement(elementId).andThen((el) =>
            ResultAsync.fromPromise(
                el.click(),
                (e) => new InteractionError(`Click failed: ${String(e)}`, elementId)
            )
        );
    }

    type(elementId: ElementId, text: string): ResultAsync<void, InteractionError> {
        return this.findElement(elementId).andThen((el) =>
            ResultAsync.fromPromise(
                el.fill(text),
                (e) => new InteractionError(`Type failed: ${String(e)}`, elementId)
            )
        );
    }

    scroll(direction: 'up' | 'down'): ResultAsync<void, InteractionError> {
        if (!this.page) {
            return errAsync(new InteractionError('Browser not launched'));
        }
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

    /**
     * Wait for DOM to stabilize after an action
     * Uses network idle detection and a small delay for JS execution
     */
    async waitForDOMStable(timeout: number = 2000): Promise<void> {
        if (!this.page) {
            return;
        }

        try {
            // Wait for network to be idle (no requests for 500ms)
            await this.page.waitForLoadState('networkidle', { timeout });
        } catch {
            // Timeout is ok - some pages have persistent connections
        }

        // Small delay to allow any JS to finish executing
        await this.page.waitForTimeout(100);
    }

    async close(): Promise<void> {
        this.agentViewService.hide();

        if (this.context) {
            // Closing context might detach the debugger or close pages
            // But for AgentView, we just want to disconnect CDP?
            // browser.close() disconnects CDP.
        }

        if (this.browser) {
            await this.browser.close(); // Disconnects CDP
            this.browser = null;
        }

        this.context = null;
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
        if (!this.page) throw new Error('Page not available');

        const url = this.page.url();
        const title = await this.page.title();
        const elements = await this.extractInteractiveElements();

        return {
            url,
            title,
            elements: Object.freeze(elements),
            timestamp: new Date(),
        };
    }

    private async extractInteractiveElements(): Promise<DOMElement[]> {
        if (!this.page) return [];

        // Raw type returned from browser context (no branded types)
        interface RawElement {
            id: number;
            tag: string;
            role: string | null;
            text: string;
            attributes: Record<string, string>;
            isInteractive: boolean;
            boundingBox: { x: number; y: number; width: number; height: number } | null;
        }

        const raw = await this.page.evaluate((): RawElement[] => {
            const interactiveSelectors = [
                'a', 'button', 'input', 'textarea', 'select',
                '[role="button"]', '[role="link"]', '[role="checkbox"]',
                '[role="radio"]', '[role="textbox"]', '[onclick]',
            ];

            const elements: RawElement[] = [];
            let idCounter = 0;

            for (const selector of interactiveSelectors) {
                const nodeList = document.querySelectorAll(selector);
                nodeList.forEach((node) => {
                    if (!(node instanceof HTMLElement)) return;
                    if (!isVisible(node)) return;

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
                        boundingBox: {
                            x: rect.x,
                            y: rect.y,
                            width: rect.width,
                            height: rect.height,
                        },
                    });
                });
            }

            return elements;

            function isVisible(el: HTMLElement): boolean {
                const style = getComputedStyle(el);
                return (
                    style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    parseFloat(style.opacity) > 0
                );
            }

            function getTextContent(el: HTMLElement): string {
                const text = el.textContent?.trim() || '';
                return text.slice(0, 100);
            }

            function extractAttrs(el: HTMLElement): Record<string, string> {
                const attrs: Record<string, string> = {};
                ['id', 'name', 'type', 'placeholder', 'aria-label', 'href', 'value'].forEach((attr) => {
                    const val = el.getAttribute(attr);
                    if (val) attrs[attr] = val;
                });
                return attrs;
            }
        });

        // Map raw browser data to domain DOMElement with branded ElementId
        return raw.map((el): DOMElement => ({
            id: el.id as unknown as ElementId,
            tag: el.tag,
            role: el.role,
            text: el.text,
            attributes: el.attributes,
            isInteractive: el.isInteractive,
            boundingBox: el.boundingBox,
        }));
    }
}
