import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { chromium, Browser, Page, Locator } from 'playwright';
import type { IStructuredAutomation, LaunchOptions, ILogger, IPerceptionSource } from '@domain/ports';
import type { Url } from '@domain/value-objects';
import type { RoleRefMap } from '@domain/value-objects/RoleRef';
import { NavigationError, InteractionError } from '@domain/errors';
import { TOOL_TIMEOUTS, SCROLL_CONSTANTS, AGENT_VIEW_CONFIG } from '@domain/constants/PlatformConstants';
import { PlaywrightPerceptionSource } from './PlaywrightPerceptionSource';

export class PlaywrightAdapter implements IStructuredAutomation {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private refs: RoleRefMap = {};

    constructor(private readonly logger: ILogger) { }

    updateRefs(refs: RoleRefMap): void {
        this.refs = refs;
    }

    launch(options: LaunchOptions): ResultAsync<void, NavigationError> {
        return ResultAsync.fromPromise(
            this.doLaunch(options),
            (e) => new NavigationError(`Failed to launch browser: ${String(e)}`)
        );
    }

    private async doLaunch(options: LaunchOptions): Promise<void> {
        this.logger.debug('[PlaywrightAdapter] Starting browser launch');

        if (!options.headless) {
            this.logger.debug('[PlaywrightAdapter] Adapting view for headless: false');
        }

        this.logger.info('[PlaywrightAdapter] Launching standalone browser');
        this.browser = await chromium.launch({
            headless: options.headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const context = await this.browser.newContext({
            ignoreHTTPSErrors: true
        });
        this.page = await context.newPage();
        this.attachPageLifecycleHandlers(this.page);
        this.logger.info('[PlaywrightAdapter] Created new page');
    }

    navigateTo(url: Url): ResultAsync<void, NavigationError> {
        this.ensureRecoverablePage();
        if (!this.page) {
            return errAsync(new NavigationError('Browser not launched'));
        }
        this.logger.debug(`[PlaywrightAdapter] Navigating to: ${url}`);
        return ResultAsync.fromPromise(
            this.page.goto(url, { waitUntil: 'load', timeout: TOOL_TIMEOUTS.NAVIGATION_MS }),
            (e) => new NavigationError(`Navigation failed: ${String(e)}`)
        ).andThen(() => ResultAsync.fromPromise(this.waitForReady(), e => new NavigationError(String(e))));
    }

    click(ref: string, options?: { force?: boolean; timeout?: number }): ResultAsync<void, InteractionError> {
        this.logger.debug(`[PlaywrightAdapter] Clicking element: ${ref}${options?.force ? ' (forced)' : ''}`);

        return this.resolveRef(ref).andThen((locator) => {
            const clickOptions = {
                force: options?.force ?? false,
                timeout: options?.timeout ?? TOOL_TIMEOUTS.ELEMENT_WAIT_MS
            };

            const attempt = (): ResultAsync<void, InteractionError> => ResultAsync.fromPromise(
                locator.click(clickOptions),
                (e) => new InteractionError(`Click failed: ${String(e)}`, ref)
            );

            return attempt().orElse((err) => {
                if (!options?.force && (err.message.includes('intercepts pointer events') || err.message.includes('Timeout'))) {
                    this.logger.warn(`[PlaywrightAdapter] Click on ${ref} intercepted or timed out, retrying with force: true`);
                    return ResultAsync.fromPromise(
                        locator.click({ ...clickOptions, force: true }),
                        (e) => new InteractionError(`Force click failed: ${String(e)}`, ref)
                    );
                }
                return errAsync(err);
            });
        });
    }

    mouseMove(x: number, y: number): ResultAsync<void, InteractionError> {
        if (!this.page) {
            return errAsync(new InteractionError('Browser not launched'));
        }
        this.logger.debug(`[PlaywrightAdapter] Moving mouse to: (${x}, ${y})`);
        return ResultAsync.fromPromise(
            this.page.mouse.move(x, y),
            (e) => new InteractionError(`Mouse move failed: ${String(e)}`)
        );
    }

    mouseClick(x: number, y: number, button: 'left' | 'right'): ResultAsync<void, InteractionError> {
        if (!this.page) {
            return errAsync(new InteractionError('Browser not launched'));
        }
        this.logger.debug(`[PlaywrightAdapter] Mouse ${button} click at: (${x}, ${y})`);
        return ResultAsync.fromPromise(
            this.page.mouse.click(x, y, { button }),
            (e) => new InteractionError(`Mouse click failed: ${String(e)}`)
        );
    }

    mouseDoubleClick(x: number, y: number): ResultAsync<void, InteractionError> {
        if (!this.page) {
            return errAsync(new InteractionError('Browser not launched'));
        }
        this.logger.debug(`[PlaywrightAdapter] Mouse double click at: (${x}, ${y})`);
        return ResultAsync.fromPromise(
            this.page.mouse.click(x, y, { button: 'left', clickCount: 2 }),
            (e) => new InteractionError(`Mouse double click failed: ${String(e)}`)
        );
    }

    mouseDrag(fromX: number, fromY: number, toX: number, toY: number, steps: number = 10): ResultAsync<void, InteractionError> {
        if (!this.page) {
            return errAsync(new InteractionError('Browser not launched'));
        }
        this.logger.debug(`[PlaywrightAdapter] Mouse drag from (${fromX}, ${fromY}) to (${toX}, ${toY}) steps=${steps}`);
        return ResultAsync.fromPromise(
            (async (): Promise<void> => {
                await this.page!.mouse.move(fromX, fromY);
                await this.page!.mouse.down();
                await this.page!.mouse.move(toX, toY, { steps: Math.max(1, Math.floor(steps)) });
                await this.page!.mouse.up();
            })(),
            (e) => new InteractionError(`Mouse drag failed: ${String(e)}`)
        );
    }

    type(ref: string, text: string): ResultAsync<void, InteractionError> {
        this.logger.debug(`[PlaywrightAdapter] Typing into element: ${ref}`);
        return this.resolveRef(ref).andThen((locator) =>
            ResultAsync.fromPromise(
                locator.fill(text),
                (e) => new InteractionError(`Type failed: ${String(e)}`, ref)
            )
        );
    }

    hover(ref: string): ResultAsync<void, InteractionError> {
        this.logger.debug(`[PlaywrightAdapter] Hovering element: ${ref}`);
        return this.resolveRef(ref).andThen((locator) =>
            ResultAsync.fromPromise(
                locator.hover({ timeout: TOOL_TIMEOUTS.ELEMENT_WAIT_MS }),
                (e) => new InteractionError(`Hover failed: ${String(e)}`, ref)
            )
        );
    }

    selectOption(ref: string, values: string[]): ResultAsync<void, InteractionError> {
        this.logger.debug(`[PlaywrightAdapter] Selecting option on element: ${ref}`);
        return this.resolveRef(ref).andThen((locator) =>
            ResultAsync.fromPromise(
                locator.selectOption(values, { timeout: TOOL_TIMEOUTS.ELEMENT_WAIT_MS }).then(() => {}),
                (e) => new InteractionError(`Select option failed: ${String(e)}`, ref)
            )
        );
    }

    dragTo(fromRef: string, toRef: string): ResultAsync<void, InteractionError> {
        this.logger.debug(`[PlaywrightAdapter] Dragging element ${fromRef} to ${toRef}`);
        return this.resolveRef(fromRef).andThen((source) =>
            this.resolveRef(toRef).andThen((target) =>
                ResultAsync.fromPromise(
                    source.dragTo(target, { timeout: TOOL_TIMEOUTS.ELEMENT_WAIT_MS }),
                    (e) => new InteractionError(`Drag failed: ${String(e)}`, fromRef)
                )
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
        const delta = direction === 'down' ? SCROLL_CONSTANTS.AMOUNT_PX : -SCROLL_CONSTANTS.AMOUNT_PX;
        return ResultAsync.fromPromise(
            this.page.mouse.wheel(0, delta),
            (e) => new InteractionError(`Scroll failed: ${String(e)}`)
        );
    }

    mouseScroll(deltaX: number, deltaY: number): ResultAsync<void, InteractionError> {
        if (!this.page) {
            return errAsync(new InteractionError('Browser not launched'));
        }
        this.logger.debug(`[PlaywrightAdapter] Mouse scroll: deltaX=${deltaX}, deltaY=${deltaY}`);
        return ResultAsync.fromPromise(
            this.page.mouse.wheel(deltaX, deltaY),
            (e) => new InteractionError(`Mouse scroll failed: ${String(e)}`)
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

    highlight(ref: string): ResultAsync<void, InteractionError> {
        return this.resolveRef(ref).andThen((locator) =>
            ResultAsync.fromPromise(
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

                    if (this.page) {
                        await this.page.waitForTimeout(500);
                    }
                })(),
                (e) => new InteractionError(`Highlight failed: ${String(e)}`, ref)
            )
        );
    }

    extractText(ref: string): ResultAsync<string, InteractionError> {
        this.logger.debug(`[PlaywrightAdapter] Extracting text from: ${ref}`);
        return this.resolveRef(ref).andThen((locator) =>
            ResultAsync.fromPromise(
                locator.innerText(),
                (e) => new InteractionError(`Extract text failed: ${String(e)}`, ref)
            )
        ).map(text => text ?? '');
    }

    async getViewportSize(): Promise<{ width: number; height: number }> {
        this.ensureRecoverablePage();
        if (!this.page) {
            return { width: AGENT_VIEW_CONFIG.DEFAULT_WIDTH, height: AGENT_VIEW_CONFIG.DEFAULT_HEIGHT };
        }
        const size = this.page.viewportSize();
        return size ?? { width: AGENT_VIEW_CONFIG.DEFAULT_WIDTH, height: AGENT_VIEW_CONFIG.DEFAULT_HEIGHT };
    }

    async waitForReady(timeout: number = 5000): Promise<void> {
        this.ensureRecoverablePage();
        if (!this.page) return;
        this.logger.debug('[PlaywrightAdapter] Waiting for page ready');
        try {
            await this.page.waitForLoadState('load', { timeout });
        } catch {
            this.logger.debug('[PlaywrightAdapter] Load-state timeout, proceeding');
        }
        try {
            await this.page.waitForLoadState('networkidle', { timeout });
        } catch {
            this.logger.debug('[PlaywrightAdapter] Network idle timeout, proceeding');
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
            return errAsync(new InteractionError('Browser not launched', ref));
        }
        const entry = this.refs[ref];
        if (!entry) {
            return errAsync(new InteractionError(`Unknown ref: ${ref}`, ref));
        }
        const locator = entry.name
            ? this.page.getByRole(entry.role as any, { name: entry.name, exact: true }).nth(entry.nth)
            : this.page.getByRole(entry.role as any).nth(entry.nth);
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
                this.logger.warn(`[PlaywrightAdapter] Recovered active page after closure: ${candidate.url()}`);
                return;
            }
        }
    }

    private attachPageLifecycleHandlers(page: Page): void {
        page.on('crash', () => {
            this.logger.error('[PlaywrightAdapter] Active page crashed');
        });

        page.on('close', () => {
            this.logger.warn('[PlaywrightAdapter] Active page closed');
            if (this.page === page) {
                this.page = null;
            }
        });
    }
}
