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

            const decision = await this.decideCaptureMode(page);
            if (decision.mode === 'single' || !decision.viewport) {
                this.logger.warn('[SmartScrollCapture] Single capture mode selected: viewport unavailable');
                return [await this.captureViewport(client)];
            }

            const viewport = decision.viewport;

            const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
            const viewportHeight = viewport.height;

            this.logger.debug(`[SmartScrollCapture] Page height: ${scrollHeight}, Viewport: ${viewportHeight}`);

            let currentScrollY = 0;
            const overlap = 100;

            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(100);

            for (let i = 0; i < maxScreenshots; i++) {
                const buffer = await this.captureViewport(client);
                screenshots.push(buffer);

                const nextScrollY = currentScrollY + (viewportHeight - overlap);

                if (currentScrollY + viewportHeight >= scrollHeight) {
                    this.logger.debug('[SmartScrollCapture] Reached bottom of page.');
                    break;
                }

                currentScrollY = nextScrollY;
                await page.evaluate((y) => window.scrollTo(0, y), currentScrollY);
                await page.waitForTimeout(200);
            }

        } catch (error) {
            this.logger.error(`[SmartScrollCapture] Failed to capture sequence: ${error}`);
        } finally {
            if (client) {
                try { await client.detach(); } catch (_error) { }
            }
        }

        return screenshots;
    }

    private async decideCaptureMode(page: Page): Promise<{ mode: 'single' | 'multi'; viewport?: { width: number; height: number } }> {
        const viewport = page.viewportSize();
        if (viewport && viewport.width > 0 && viewport.height > 0) {
            return { mode: 'multi', viewport };
        }

        const dimensions = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
        if (dimensions.width > 0 && dimensions.height > 0) {
            return { mode: 'multi', viewport: dimensions };
        }

        return { mode: 'single' };
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
