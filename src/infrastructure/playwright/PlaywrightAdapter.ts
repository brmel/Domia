import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { type Browser, type Page, type Locator } from 'playwright';
import type { IStructuredAutomation, LaunchOptions, ILogger, IPerceptionSource } from '@domain/ports';
import type { Url } from '@domain/value-objects';
import type { RoleRefMap } from '@domain/value-objects/RoleRef';
import { NavigationError, InteractionError } from '@domain/errors';
import { TOOL_TIMEOUTS, SCROLL_CONSTANTS, AGENT_VIEW_CONFIG } from '@domain/constants/PlatformConstants';
import { CONTENT_READY_TIMEOUT_MS, CHROMIUM_LAUNCH_ARGS } from '@shared/defaults';
import { PlaywrightPerceptionSource } from './PlaywrightPerceptionSource';
import type { BrowserPool } from './BrowserPool';

const BROWSER_NOT_LAUNCHED = 'Browser not launched';
const TAG = '[PlaywrightAdapter]';

/** Wrap a promise as ResultAsync<T, InteractionError> with a consistent message. */
function wrapInteraction<T>(promise: Promise<T>, label: string, ref?: string): ResultAsync<T, InteractionError> {
    return ResultAsync.fromPromise(promise, (e) => new InteractionError(`${label} failed: ${String(e)}`, ref));
}

export class PlaywrightAdapter implements IStructuredAutomation {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private refs: RoleRefMap = {};
    private pool: BrowserPool | null = null;

    constructor(private readonly logger: ILogger, pool?: BrowserPool) {
        this.pool = pool ?? null;
    }

    /** Returns the active Page or an InteractionError if unavailable. */
    private requirePage(): ResultAsync<Page, InteractionError> {
        this.ensureRecoverablePage();
        return this.page ? okAsync(this.page) : errAsync(new InteractionError(BROWSER_NOT_LAUNCHED));
    }

    updateRefs(refs: RoleRefMap): void {
        this.refs = refs;
        this.logger.debug(`${TAG} Refs updated: ${Object.keys(refs).length} elements`);
    }

    launch(options: LaunchOptions): ResultAsync<void, NavigationError> {
        return ResultAsync.fromPromise(
            this.doLaunch(options),
            (e) => new NavigationError(`Failed to launch browser: ${String(e)}`)
        );
    }

    private async doLaunch(options: LaunchOptions): Promise<void> {
        this.logger.debug(`${TAG} Starting browser launch`);

        if (this.pool) {
            this.browser = await this.pool.acquire(options.headless);
        } else {
            const { chromium } = await import('playwright');
            this.browser = await chromium.launch({
                headless: options.headless,
                args: [...CHROMIUM_LAUNCH_ARGS]
            });
        }
        const context = await this.browser.newContext({
            ignoreHTTPSErrors: true
        });
        this.page = await context.newPage();
        this.attachPageLifecycleHandlers(this.page);
        this.logger.info(`${TAG} Created new page`);
    }

    navigateTo(url: Url): ResultAsync<void, NavigationError> {
        this.ensureRecoverablePage();
        if (!this.page) {
            return errAsync(new NavigationError(BROWSER_NOT_LAUNCHED));
        }
        this.logger.debug(`${TAG} Navigating to: ${url}`);
        return ResultAsync.fromPromise(
            this.page.goto(url, { waitUntil: 'load', timeout: TOOL_TIMEOUTS.NAVIGATION_MS }),
            (e) => new NavigationError(`Navigation failed: ${String(e)}`)
        ).andThen(() => ResultAsync.fromPromise(this.waitForReady(), e => new NavigationError(String(e))));
    }

    click(ref: string, options?: { force?: boolean; timeout?: number }): ResultAsync<void, InteractionError> {
        this.logger.debug(`${TAG} Clicking element: ${ref}${options?.force ? ' (forced)' : ''}`);

        return this.resolveRef(ref).andThen((locator) => {
            const clickOptions = {
                force: options?.force ?? false,
                timeout: options?.timeout ?? TOOL_TIMEOUTS.ELEMENT_WAIT_MS
            };

            return wrapInteraction(locator.click(clickOptions), 'Click', ref).orElse((err) => {
                if (!options?.force && (err.message.includes('intercepts pointer events') || err.message.includes('Timeout'))) {
                    this.logger.warn(`${TAG} Click on ${ref} intercepted or timed out, retrying with force: true`);
                    return wrapInteraction(locator.click({ ...clickOptions, force: true }), 'Force click', ref);
                }
                return errAsync(err);
            });
        });
    }

    mouseMove(x: number, y: number): ResultAsync<void, InteractionError> {
        return this.requirePage().andThen((page) => {
            this.logger.debug(`${TAG} Moving mouse to: (${x}, ${y})`);
            return wrapInteraction(page.mouse.move(x, y), 'Mouse move');
        });
    }

    mouseClick(x: number, y: number, button: 'left' | 'right'): ResultAsync<void, InteractionError> {
        return this.requirePage().andThen((page) => {
            this.logger.debug(`${TAG} Mouse ${button} click at: (${x}, ${y})`);
            return wrapInteraction(page.mouse.click(x, y, { button }), 'Mouse click');
        });
    }

    mouseDoubleClick(x: number, y: number): ResultAsync<void, InteractionError> {
        return this.requirePage().andThen((page) => {
            this.logger.debug(`${TAG} Mouse double click at: (${x}, ${y})`);
            return wrapInteraction(page.mouse.click(x, y, { button: 'left', clickCount: 2 }), 'Mouse double click');
        });
    }

    mouseDrag(fromX: number, fromY: number, toX: number, toY: number, steps: number = 10): ResultAsync<void, InteractionError> {
        return this.requirePage().andThen((page) => {
            this.logger.debug(`${TAG} Mouse drag from (${fromX}, ${fromY}) to (${toX}, ${toY}) steps=${steps}`);
            return wrapInteraction(
                (async (): Promise<void> => {
                    await page.mouse.move(fromX, fromY);
                    await page.mouse.down();
                    await page.mouse.move(toX, toY, { steps: Math.max(1, Math.floor(steps)) });
                    await page.mouse.up();
                })(),
                'Mouse drag'
            );
        });
    }

    type(ref: string, text: string): ResultAsync<void, InteractionError> {
        this.logger.debug(`${TAG} Typing into element: ${ref}`);
        return this.resolveRef(ref).andThen((locator) =>
            wrapInteraction(locator.fill(text), 'Type', ref)
        );
    }

    hover(ref: string): ResultAsync<void, InteractionError> {
        this.logger.debug(`${TAG} Hovering element: ${ref}`);
        return this.resolveRef(ref).andThen((locator) =>
            wrapInteraction(locator.hover({ timeout: TOOL_TIMEOUTS.ELEMENT_WAIT_MS }), 'Hover', ref)
        );
    }

    selectOption(ref: string, values: string[]): ResultAsync<void, InteractionError> {
        this.logger.debug(`${TAG} Selecting option on element: ${ref}`);
        return this.resolveRef(ref).andThen((locator) =>
            wrapInteraction(locator.selectOption(values, { timeout: TOOL_TIMEOUTS.ELEMENT_WAIT_MS }).then(() => {}), 'Select option', ref)
        );
    }

    dragTo(fromRef: string, toRef: string): ResultAsync<void, InteractionError> {
        this.logger.debug(`${TAG} Dragging element ${fromRef} to ${toRef}`);
        return this.resolveRef(fromRef).andThen((source) =>
            this.resolveRef(toRef).andThen((target) =>
                wrapInteraction(source.dragTo(target, { timeout: TOOL_TIMEOUTS.ELEMENT_WAIT_MS }), 'Drag', fromRef)
            )
        );
    }

    pressKey(key: string): ResultAsync<void, InteractionError> {
        return this.requirePage().andThen((page) => {
            this.logger.debug(`${TAG} Pressing key: ${key}`);
            return wrapInteraction(page.keyboard.press(key), 'Press key');
        });
    }

    scroll(direction: 'up' | 'down'): ResultAsync<void, InteractionError> {
        return this.requirePage().andThen((page) => {
            this.logger.debug(`${TAG} Scrolling: ${direction}`);
            const delta = direction === 'down' ? SCROLL_CONSTANTS.AMOUNT_PX : -SCROLL_CONSTANTS.AMOUNT_PX;
            return wrapInteraction(page.mouse.wheel(0, delta), 'Scroll');
        });
    }

    mouseScroll(deltaX: number, deltaY: number): ResultAsync<void, InteractionError> {
        return this.requirePage().andThen((page) => {
            this.logger.debug(`${TAG} Mouse scroll: deltaX=${deltaX}, deltaY=${deltaY}`);
            return wrapInteraction(page.mouse.wheel(deltaX, deltaY), 'Mouse scroll');
        });
    }

    wait(durationMs: number): ResultAsync<void, InteractionError> {
        return this.requirePage().andThen((page) =>
            wrapInteraction(page.waitForTimeout(durationMs), 'Wait')
        );
    }

    highlight(ref: string): ResultAsync<void, InteractionError> {
        return this.resolveRef(ref).andThen((locator) =>
            wrapInteraction(
                (async (): Promise<void> => {
                    await locator.scrollIntoViewIfNeeded();

                    await locator.evaluate((node, highlightMs) => {
                        const element = node as HTMLElement;
                        const originalOutline = element.style.outline;
                        const originalTransition = element.style.transition;

                        element.style.transition = 'outline 0.1s ease-in-out';
                        element.style.outline = '3px solid #ff0000';
                        element.style.outlineOffset = '2px';

                        setTimeout(() => {
                            element.style.outline = originalOutline;
                            element.style.transition = originalTransition;
                        }, highlightMs);
                    }, TOOL_TIMEOUTS.HIGHLIGHT_DURATION_MS);
                })(),
                'Highlight', ref
            )
        );
    }

    extractText(ref: string): ResultAsync<string, InteractionError> {
        this.logger.debug(`${TAG} Extracting text from: ${ref}`);
        return this.resolveRef(ref).andThen((locator) =>
            wrapInteraction(locator.innerText(), 'Extract text', ref)
        ).map(text => text ?? '');
    }

    getCurrentUrl(): string | null {
        this.ensureRecoverablePage();
        return this.page?.url() ?? null;
    }

    async getViewportSize(): Promise<{ width: number; height: number }> {
        this.ensureRecoverablePage();
        if (!this.page) {
            return { width: AGENT_VIEW_CONFIG.DEFAULT_WIDTH, height: AGENT_VIEW_CONFIG.DEFAULT_HEIGHT };
        }
        const size = this.page.viewportSize();
        return size ?? { width: AGENT_VIEW_CONFIG.DEFAULT_WIDTH, height: AGENT_VIEW_CONFIG.DEFAULT_HEIGHT };
    }

    async waitForReady(timeout: number = CONTENT_READY_TIMEOUT_MS): Promise<void> {
        this.ensureRecoverablePage();
        if (!this.page) return;
        const start = Date.now();
        this.logger.debug(`${TAG} Waiting for page ready`);
        try {
            await this.page.waitForLoadState('load', { timeout });
        } catch {
            this.logger.debug(`${TAG} Load-state timeout, proceeding`);
        }
        try {
            await this.page.waitForLoadState('networkidle', { timeout });
        } catch {
            this.logger.debug(`${TAG} Network idle timeout, proceeding`);
        }
        this.logger.debug(`${TAG} Page ready in ${Date.now() - start}ms`);
    }

    async close(): Promise<void> {
        this.logger.debug(`${TAG} Closing browser context`);

        if (this.pool) {
            this.pool.release();
        } else if (this.browser) {
            await this.browser.close();
        }
        this.browser = null;
        this.page = null;
    }

    getPerceptionSource(): IPerceptionSource | null {
        this.ensureRecoverablePage();
        return this.page ? new PlaywrightPerceptionSource(this.page) : null;
    }

    getPage(): Page | null {
        this.ensureRecoverablePage();
        return this.page;
    }

    setAttachedPage(page: Page): void {
        this.page = page;
        this.browser = page.context().browser();
        this.attachPageLifecycleHandlers(page);
    }

    private resolveRef(ref: string): ResultAsync<Locator, InteractionError> {
        this.ensureRecoverablePage();
        if (!this.page) {
            return errAsync(new InteractionError(BROWSER_NOT_LAUNCHED, ref));
        }
        const entry = this.refs[ref];
        if (!entry) {
            this.logger.warn(`${TAG} resolveRef failed: unknown ref "${ref}" (available: ${Object.keys(this.refs).join(', ')})`);
            return errAsync(new InteractionError(`Unknown ref: ${ref}`, ref));
        }
        type AriaRole = Parameters<Page['getByRole']>[0];
        const base = entry.name
            ? this.page.getByRole(entry.role as AriaRole, { name: entry.name, exact: true })
            : this.page.getByRole(entry.role as AriaRole);
        const locator = entry.nth !== undefined ? base.nth(entry.nth) : base;
        this.logger.debug(`${TAG} Resolved ref "${ref}" → ${entry.role}${entry.name ? ` "${entry.name}"` : ''}${entry.nth !== undefined ? ` nth=${entry.nth}` : ''}`);
        return okAsync(locator);
    }

    private ensureRecoverablePage(): void {
        if (this.page && !this.page.isClosed()) {
            return;
        }

        this.page = null;
        if (!this.browser) {
            return;
        }

        for (const context of this.browser.contexts()) {
            const candidate = context.pages().find((page) => !page.isClosed());
            if (candidate) {
                this.page = candidate;
                this.attachPageLifecycleHandlers(candidate);
                this.logger.warn(`${TAG} Recovered active page after closure: ${candidate.url()}`);
                return;
            }
        }
    }

    private attachPageLifecycleHandlers(page: Page): void {
        page.on('crash', () => {
            this.logger.error(`${TAG} Active page crashed`);
        });

        page.on('close', () => {
            this.logger.debug(`${TAG} Active page closed`);
            if (this.page === page) {
                this.page = null;
            }
        });
    }
}
