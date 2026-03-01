import type { Page, CDPSession } from 'playwright';
import type { IPerceptionSource, ScreenshotOptions } from '@domain/ports/IPerceptionSource';

/**
 * Playwright-backed perception source.
 * Wraps a Playwright Page so sensors never import Playwright directly.
 */
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

    async getAccessibilityTree(options?: { interestingOnly?: boolean }): Promise<unknown> {
        const pageWithA11y = this.page as unknown as {
            accessibility?: {
                snapshot(options: { interestingOnly: boolean }): Promise<unknown>;
            };
        };
        if (!pageWithA11y.accessibility) return null;
        try {
            return await pageWithA11y.accessibility.snapshot({
                interestingOnly: options?.interestingOnly ?? false,
            }) ?? null;
        } catch {
            return null;
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

    async createCDPSession(): Promise<CDPSession> {
        return this.page.context().newCDPSession(this.page);
    }
}
