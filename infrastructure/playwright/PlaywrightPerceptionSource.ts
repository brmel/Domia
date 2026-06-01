import type { Page } from 'playwright';
import type { IPerceptionSource, ScreenshotOptions } from '@domain/ports/perception/IPerceptionSource';
import { DEFAULT_SCREENSHOT_QUALITY, CONTENT_READY_TIMEOUT_MS } from '@shared/defaults';

export class PlaywrightPerceptionSource implements IPerceptionSource {
    private readonly getPage: () => Page;

    /**
     * Accepts a fixed page or a page-getter. The getter form lets the source follow
     * the adapter's *current* page after an Electron window switch (re-pointing the
     * adapter re-points perception too), instead of pinning to the page at creation.
     */
    constructor(page: Page | (() => Page)) {
        this.getPage = typeof page === 'function' ? page : (): Page => page;
    }

    getUrl(): string {
        return this.getPage().url();
    }

    async getTitle(): Promise<string> {
        return this.getPage().title();
    }

    async captureScreenshot(options?: ScreenshotOptions): Promise<Buffer> {
        return this.getPage().screenshot({
            ...(options?.fullPage !== undefined ? { fullPage: options.fullPage } : {}),
            type: options?.type ?? 'jpeg',
            quality: options?.quality ?? DEFAULT_SCREENSHOT_QUALITY,
        });
    }

    async evaluateScript<T>(pageFunction: string | ((...args: unknown[]) => T), ...args: unknown[]): Promise<T> {
        // Playwright's evaluate() uses complex generic overloads not compatible with our
        // abstract signature — the single-arg collapse is intentional and runtime-correct.
        const page = this.getPage();
        const arg = args.length === 0 ? undefined : args.length === 1 ? args[0] : args;
        return page.evaluate(pageFunction as Parameters<typeof page.evaluate>[0], arg) as Promise<T>;
    }

    async getAriaSnapshot(): Promise<string> {
        try {
            return await this.getPage().locator('body').ariaSnapshot();
        } catch {
            // ariaSnapshot is best-effort — not all pages/contexts support it
            return '';
        }
    }

    async waitForContentReady(timeout = CONTENT_READY_TIMEOUT_MS): Promise<void> {
        await this.getPage().waitForLoadState('domcontentloaded', { timeout }).catch(() => {});
    }

    getViewportSize(): { width: number; height: number } | null {
        return this.getPage().viewportSize();
    }

    async createCDPSession(): Promise<unknown> {
        const page = this.getPage();
        return page.context().newCDPSession(page);
    }
}
