import { injectable, inject } from 'tsyringe';
import { Page, CDPSession } from 'playwright';
import type { ILogger } from '@domain/ports';


@injectable()
export class SmartScrollCapture {
    constructor(
        @inject('ILogger') private logger: ILogger
    ) { }

    async capture(page: Page, maxScreenshots: number = 3): Promise<Buffer[]> {
        const screenshots: Buffer[] = [];
        let client: CDPSession | null = null;

        try {
            client = await page.context().newCDPSession(page);

            let viewport = page.viewportSize();
            if (!viewport) {
                // Fallback to window dimensions if viewport is not set (e.g. CDP attachment)
                const dimensions = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
                if (dimensions.width > 0 && dimensions.height > 0) {
                    viewport = dimensions;
                    this.logger.debug(`[SmartScrollCapture] Using fallback viewport: ${JSON.stringify(viewport)}`);
                }
            }

            if (!viewport) {
                this.logger.warn('[SmartScrollCapture] No viewport size available, verifying single capture only.');
                return [await this.captureViewport(client)];
            }

            // Get total page height
            const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
            const viewportHeight = viewport.height;

            this.logger.debug(`[SmartScrollCapture] Page height: ${scrollHeight}, Viewport: ${viewportHeight}`);

            let currentScrollY = 0;
            const overlap = 100; // 100px overlap to prevent cutting off text/elements

            // Reset scroll to top start
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(100);

            for (let i = 0; i < maxScreenshots; i++) {
                // Capture
                const buffer = await this.captureViewport(client);
                screenshots.push(buffer);

                // Calculate next scroll position
                const nextScrollY = currentScrollY + (viewportHeight - overlap);

                // Check if we reached the bottom
                // If we are already at the bottom from previous scroll, break.
                // Or if the next scroll would be redundant (very small delta).
                if (currentScrollY + viewportHeight >= scrollHeight) {
                    this.logger.debug('[SmartScrollCapture] Reached bottom of page.');
                    break;
                }

                // Execute scroll
                currentScrollY = nextScrollY;
                await page.evaluate((y) => window.scrollTo(0, y), currentScrollY);

                // Wait for stability / sticky headers to settle
                await page.waitForTimeout(200);
            }

        } catch (error) {
            this.logger.error(`[SmartScrollCapture] Failed to capture sequence: ${error}`);
            // Return whatever we have so far
        } finally {
            if (client) {
                try { await client.detach(); } catch (e) { /* ignore */ }
            }
        }

        return screenshots;
    }

    private async captureViewport(client: CDPSession): Promise<Buffer> {
        const result = await client.send('Page.captureScreenshot', {
            format: 'jpeg',
            quality: 60,
            fromSurface: true
        });
        return Buffer.from(result.data, 'base64');
    }
}
