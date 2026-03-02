import type { Page } from 'playwright';
import type { IPerceptionSource, ScreenshotOptions } from '@domain/ports/IPerceptionSource';

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
            quality: options?.quality ?? 60,
        });
    }

    async evaluateScript<T>(pageFunction: string | ((...args: unknown[]) => T), ...args: unknown[]): Promise<T> {
        return this.page.evaluate(pageFunction as never, ...args);
    }

    async getAriaSnapshot(): Promise<string> {
        try {
            return await this.page.locator('body').ariaSnapshot();
        } catch {
            return '';
        }
    }

    async waitForContentReady(timeout = 5000): Promise<void> {
        try {
            await this.page.waitForLoadState('domcontentloaded', { timeout });
        } catch {
            // Timeout is expected for slow pages; we proceed regardless.
        }
    }

    getViewportSize(): { width: number; height: number } | null {
        return this.page.viewportSize();
    }

    async createCDPSession(): Promise<unknown> {
        return this.page.context().newCDPSession(this.page);
    }
}
