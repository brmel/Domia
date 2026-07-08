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
            const snapshot = await this.getPage().locator('body').ariaSnapshot();
            return `${snapshot}${this.describeChildFrames()}`;
        } catch {
            // ariaSnapshot is best-effort — not all pages/contexts support it
            return '';
        }
    }

    // ariaSnapshot covers the main frame only; complex apps embed webviews/iframes
    // whose content would otherwise be invisible to the agent.
    private describeChildFrames(): string {
        const page = this.getPage();
        const frames = page.frames().filter((f) => f !== page.mainFrame() && f.url() && f.url() !== 'about:blank');
        if (frames.length === 0) return '';
        const lines = frames.slice(0, 10).map((f) => `${f.name() || '(unnamed frame)'}: ${f.url()}`);
        return `\n\nEMBEDDED FRAMES — content NOT included above (${frames.length}):\n${lines.join('\n')}`;
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
