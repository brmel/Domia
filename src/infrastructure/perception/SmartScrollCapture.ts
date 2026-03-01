import { injectable, inject } from 'tsyringe';
import type { IPerceptionSource } from '@domain/ports/IPerceptionSource';
import type { ILogger } from '@domain/ports';

interface CDPSessionLike {
    send(method: string, params?: Record<string, unknown>): Promise<{ data: string }>;
    detach(): Promise<void>;
}


@injectable()
export class SmartScrollCapture {
    constructor(
        @inject('ILogger') private logger: ILogger
    ) { }

    async capture(source: IPerceptionSource, maxScreenshots: number = 3): Promise<Buffer[]> {
        const screenshots: Buffer[] = [];
        let client: CDPSessionLike | null = null;

        try {
            if (source.createCDPSession) {
                client = await source.createCDPSession() as CDPSessionLike;
            }

            const decision = this.decideCaptureMode(source);
            if (decision.mode === 'single' || !decision.viewport) {
                this.logger.warn('[SmartScrollCapture] Single capture mode selected: viewport unavailable');
                return [await this.captureFrame(client, source)];
            }

            const viewport = decision.viewport;

            const scrollHeight = await source.evaluateScript(() => document.documentElement.scrollHeight);
            const viewportHeight = viewport.height;

            this.logger.debug(`[SmartScrollCapture] Page height: ${scrollHeight}, Viewport: ${viewportHeight}`);

            let currentScrollY = 0;
            const overlap = 100;

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

    private decideCaptureMode(source: IPerceptionSource): { mode: 'single' | 'multi'; viewport?: { width: number; height: number } } {
        const viewport = source.getViewportSize();
        if (viewport && viewport.width > 0 && viewport.height > 0) {
            return { mode: 'multi', viewport };
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
                quality: 60,
                fromSurface: true,
            });
            return Buffer.from(result.data, 'base64');
        }
        return source.captureScreenshot({ type: 'jpeg', quality: 60 });
    }
}
