import { injectable, inject } from 'tsyringe';
import type { IPerceptionSource } from '@domain/ports/perception/IPerceptionSource';
import type { ILogger } from '@domain/ports';
import { DEFAULT_MAX_SCROLL_SCREENSHOTS, SCROLL_OVERLAP_PX, SCROLL_CAPTURE_QUALITY } from '@shared/defaults';

interface CDPSessionLike {
    send(method: string, params?: Record<string, unknown>): Promise<{ data: string }>;
    detach(): Promise<void>;
}


@injectable()
export class SmartScrollCapture {
    constructor(
        @inject('ILogger') private logger: ILogger
    ) { }

    async capture(source: IPerceptionSource, maxScreenshots: number = DEFAULT_MAX_SCROLL_SCREENSHOTS): Promise<Buffer[]> {
        const screenshots: Buffer[] = [];
        let client: CDPSessionLike | null = null;

        try {
            if (source.createCDPSession) {
                client = await source.createCDPSession() as CDPSessionLike;
            }

            const decision = await this.decideCaptureMode(source);
            if (decision.mode === 'single' || !decision.viewport) {
                this.logger.warn('[SmartScrollCapture] Single capture mode selected: viewport unavailable');
                return [await this.captureFrame(client, source)];
            }

            const viewport = decision.viewport;

            const scrollHeight = await source.evaluateScript(() => document.documentElement.scrollHeight);
            const viewportHeight = viewport.height;

            this.logger.debug(`[SmartScrollCapture] Page height: ${scrollHeight}, Viewport: ${viewportHeight}`);

            let currentScrollY = 0;
            const overlap = SCROLL_OVERLAP_PX;

            await source.evaluateScript(() => window.scrollTo(0, 0));

            for (let i = 0; i < maxScreenshots; i++) {
                const buffer = await this.captureFrame(client, source);
                screenshots.push(buffer);

                const nextScrollY = currentScrollY + (viewportHeight - overlap);

                if (currentScrollY + viewportHeight >= scrollHeight) {
                    this.logger.debug('[SmartScrollCapture] Reached bottom of page.');
                    break;
                }

                currentScrollY = nextScrollY;
                await source.evaluateScript(((y: unknown) => window.scrollTo(0, y as number)) as (...args: unknown[]) => void, currentScrollY);
            }

        } catch (error) {
            this.logger.error(`[SmartScrollCapture] Failed to capture sequence: ${error}`);
        } finally {
            if (client) {
                try {
                    await client.detach();
                } catch (detachError) {
                    this.logger.debug(`[SmartScrollCapture] Ignoring CDP detach error: ${String(detachError)}`);
                }
            }
        }

        return screenshots;
    }

    private async decideCaptureMode(source: IPerceptionSource): Promise<{ mode: 'single' | 'multi'; viewport?: { width: number; height: number } }> {
        const viewport = source.getViewportSize();
        if (viewport && viewport.width > 0 && viewport.height > 0) {
            return { mode: 'multi', viewport };
        }
        // Fallback: query the DOM directly (covers CDP-connected pages where
        // Playwright doesn't control the viewport, e.g. embedded Electron views)
        try {
            const domViewport = await source.evaluateScript(
                () => ({ width: window.innerWidth, height: window.innerHeight })
            );
            if (domViewport && domViewport.width > 0 && domViewport.height > 0) {
                return { mode: 'multi', viewport: domViewport };
            }
        } catch {
            // evaluateScript may fail on about:blank or detached pages
        }
        return { mode: 'single' };
    }

    private async captureFrame(
        client: CDPSessionLike | null,
        source: IPerceptionSource,
    ): Promise<Buffer> {
        if (client) {
            const result = await client.send('Page.captureScreenshot', {
                format: 'jpeg',
                quality: SCROLL_CAPTURE_QUALITY,
                fromSurface: true,
            });
            return Buffer.from(result.data, 'base64');
        }
        return source.captureScreenshot({ type: 'jpeg', quality: SCROLL_CAPTURE_QUALITY });
    }
}
