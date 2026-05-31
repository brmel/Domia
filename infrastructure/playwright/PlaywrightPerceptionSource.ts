import type { Page } from 'playwright';
import type { IPerceptionSource, ScreenshotOptions } from '@domain/ports/perception/IPerceptionSource';
import { DEFAULT_SCREENSHOT_QUALITY, CONTENT_READY_TIMEOUT_MS } from '@shared/defaults';

export class PlaywrightPerceptionSource implements IPerceptionSource {
    constructor(private readonly page: Page) {}

    getUrl(): string {
        return this.page.url();
    }

    async getTitle(): Promise<string> {
        return this.page.title();
    }

    async captureScreenshot(options?: ScreenshotOptions): Promise<Buffer> {
        return this.page.screenshot({
            ...(options?.fullPage !== undefined ? { fullPage: options.fullPage } : {}),
            type: options?.type ?? 'jpeg',
            quality: options?.quality ?? DEFAULT_SCREENSHOT_QUALITY,
        });
    }

    async evaluateScript<T>(pageFunction: string | ((...args: unknown[]) => T), ...args: unknown[]): Promise<T> {
        // Playwright's evaluate() uses complex generic overloads not compatible with our
        // abstract signature — the single-arg collapse is intentional and runtime-correct.
        const arg = args.length === 0 ? undefined : args.length === 1 ? args[0] : args;
        return this.page.evaluate(pageFunction as Parameters<typeof this.page.evaluate>[0], arg) as Promise<T>;
    }

    async getAriaSnapshot(): Promise<string> {
        try {
            return await this.page.locator('body').ariaSnapshot();
        } catch {
            // ariaSnapshot is best-effort — not all pages/contexts support it
            return '';
        }
    }

    async waitForContentReady(timeout = CONTENT_READY_TIMEOUT_MS): Promise<void> {
        await this.page.waitForLoadState('domcontentloaded', { timeout }).catch(() => {});
    }

    getViewportSize(): { width: number; height: number } | null {
        return this.page.viewportSize();
    }

    async createCDPSession(): Promise<unknown> {
        return this.page.context().newCDPSession(this.page);
    }
}
