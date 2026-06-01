import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { type Browser, type BrowserContext, type Page, type Locator } from 'playwright';
import type { IStructuredAutomation, LaunchOptions, ILogger, IPerceptionSource } from '@domain/ports';
import type { ITabManager, TabInfo } from '@domain/ports/automation/ITabManager';
import type { Url } from '@domain/value-objects';
import type { RoleRefMap } from '@domain/value-objects/RoleRef';
import { NavigationError, InteractionError } from '@domain/errors';
import {
    NAVIGATION_TIMEOUT_MS,
    SCROLL_AMOUNT_PX, AGENT_VIEW_WIDTH, AGENT_VIEW_HEIGHT,
    CONTENT_READY_TIMEOUT_MS, CHROMIUM_LAUNCH_ARGS,
} from '@shared/defaults';
import { PlaywrightPerceptionSource } from './PlaywrightPerceptionSource';
import { PlaywrightTabs } from './PlaywrightTabs';
import { PlaywrightMouse } from './PlaywrightMouse';
import { PlaywrightInteraction } from './PlaywrightInteraction';
import { wrapInteraction } from './wrapInteraction';
import type { BrowserPool } from './BrowserPool';

const BROWSER_NOT_LAUNCHED = 'Browser not launched';
const TAG = '[PlaywrightAdapter]';

export class PlaywrightAdapter implements IStructuredAutomation, ITabManager {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    private refs: RoleRefMap = {};
    private pool: BrowserPool | null = null;
    private _ownsBrowser = false;
    private readonly tabs: PlaywrightTabs;
    private readonly mouse: PlaywrightMouse;
    private readonly interaction: PlaywrightInteraction;

    constructor(private readonly logger: ILogger, pool?: BrowserPool) {
        this.pool = pool ?? null;
        this.tabs = new PlaywrightTabs({
            context: (): BrowserContext | null => this.context,
            activePage: (): Page | null => this.page,
            setActivePage: (page): void => { this.page = page; },
            attachLifecycle: (page): void => this.attachPageLifecycleHandlers(page),
            waitForReady: (): Promise<void> => this.waitForReady(),
        });
        this.mouse = new PlaywrightMouse(() => this.requirePage(), this.logger);
        this.interaction = new PlaywrightInteraction((ref) => this.resolveRef(ref), this.logger);
    }

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
        const deviceContext = options.device ? await this.resolveDeviceContext(options.device) : {};
        const context = await this.browser.newContext({
            ignoreHTTPSErrors: true,
            ...deviceContext,
        });
        this.context = context;
        this.page = await context.newPage();
        this._ownsBrowser = true;
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
            this.page.goto(url, { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS }),
            (e) => new NavigationError(`Navigation failed: ${String(e)}`)
        ).andThen(() => ResultAsync.fromPromise(this.waitForReady(), e => new NavigationError(String(e))));
    }

    click(ref: string, options?: { force?: boolean; timeout?: number }): ResultAsync<void, InteractionError> {
        return this.interaction.click(ref, options);
    }

    mouseMove(x: number, y: number): ResultAsync<void, InteractionError> {
        return this.mouse.move(x, y);
    }

    mouseClick(x: number, y: number, button: 'left' | 'right'): ResultAsync<void, InteractionError> {
        return this.mouse.click(x, y, button);
    }

    mouseDoubleClick(x: number, y: number): ResultAsync<void, InteractionError> {
        return this.mouse.doubleClick(x, y);
    }

    mouseDrag(fromX: number, fromY: number, toX: number, toY: number, steps: number = 10): ResultAsync<void, InteractionError> {
        return this.mouse.drag(fromX, fromY, toX, toY, steps);
    }

    type(ref: string, text: string): ResultAsync<void, InteractionError> {
        return this.interaction.type(ref, text);
    }

    hover(ref: string): ResultAsync<void, InteractionError> {
        return this.interaction.hover(ref);
    }

    selectOption(ref: string, values: string[]): ResultAsync<void, InteractionError> {
        return this.interaction.selectOption(ref, values);
    }

    dragTo(fromRef: string, toRef: string): ResultAsync<void, InteractionError> {
        return this.interaction.dragTo(fromRef, toRef);
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
            const delta = direction === 'down' ? SCROLL_AMOUNT_PX : -SCROLL_AMOUNT_PX;
            return wrapInteraction(page.mouse.wheel(0, delta), 'Scroll');
        });
    }

    mouseScroll(deltaX: number, deltaY: number): ResultAsync<void, InteractionError> {
        return this.mouse.scroll(deltaX, deltaY);
    }

    wait(durationMs: number): ResultAsync<void, InteractionError> {
        return this.requirePage().andThen((page) =>
            wrapInteraction(page.waitForTimeout(durationMs), 'Wait')
        );
    }

    highlight(ref: string): ResultAsync<void, InteractionError> {
        return this.interaction.highlight(ref);
    }

    extractText(ref: string): ResultAsync<string, InteractionError> {
        return this.interaction.extractText(ref);
    }

    getCurrentUrl(): string | null {
        this.ensureRecoverablePage();
        return this.page?.url() ?? null;
    }

    async getViewportSize(): Promise<{ width: number; height: number }> {
        this.ensureRecoverablePage();
        if (!this.page) {
            return { width: AGENT_VIEW_WIDTH, height: AGENT_VIEW_HEIGHT };
        }
        const size = this.page.viewportSize();
        return size ?? { width: AGENT_VIEW_WIDTH, height: AGENT_VIEW_HEIGHT };
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

        if (!this._ownsBrowser) {
            if (this.page && !this.page.isClosed()) {
                await this.page.goto('about:blank').catch(() => {});
            }
        } else if (this.pool) {
            this.pool.release();
        } else if (this.browser) {
            await this.browser.close();
        }
        this.browser = null;
        this.context = null;
        this.page = null;
        this._ownsBrowser = false;
    }

    newTab(url?: string): Promise<TabInfo> {
        return this.tabs.newTab(url);
    }

    listTabs(): Promise<TabInfo[]> {
        return this.tabs.listTabs();
    }

    switchTab(index: number): Promise<TabInfo> {
        return this.tabs.switchTab(index);
    }

    closeTab(index?: number): Promise<void> {
        return this.tabs.closeTab(index);
    }

    getPerceptionSource(): IPerceptionSource | null {
        this.ensureRecoverablePage();
        return this.page ? new PlaywrightPerceptionSource(this.page) : null;
    }

    getPlaywrightPage(): Page | null {
        return this.page;
    }

    setAttachedPage(page: Page): void {
        this.page = page;
        this.browser = page.context().browser();
        this._ownsBrowser = false;
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

    private async resolveDeviceContext(device: string): Promise<Record<string, unknown>> {
        const { devices } = await import('playwright');
        const preset = devices[device];
        if (!preset) {
            this.logger.warn(`${TAG} Unknown device preset "${device}", ignoring`);
            return {};
        }
        return preset as unknown as Record<string, unknown>;
    }
}
