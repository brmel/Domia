import { injectable } from 'tsyringe';
import { Page } from 'playwright';
import { ISensor } from '@domain/ports/ISensor';

@injectable()
export class VisionSensor implements ISensor<{ screenshot: Buffer; mimeType: string }> {
    public readonly name = 'VisionSensor';

    constructor() { }

    async capture(page: Page): Promise<{ screenshot: Buffer; mimeType: string }> {
        // Use CDP to capture screenshot effectively even when browser execution is paused
        // preventing deadlocks that occur with standard page.screenshot() in paused state.

        let client;
        try {
            // Create a dedicated CDP session for this operation
            client = await page.context().newCDPSession(page);

            const result = await client.send('Page.captureScreenshot', {
                format: 'jpeg',
                quality: 60, // Optimized for speed/size
                fromSurface: true
            });

            // Detach session after use
            await client.detach();

            const buffer = Buffer.from(result.data, 'base64');

            return {
                screenshot: buffer,
                mimeType: 'image/jpeg'
            };
        } catch (error) {
            // Fallback to standard screenshot if CDP fails (unlikely, but safe)
            // Note: This fallback WILL hang if paused, but it's better than crashing upfront if CDP fails.
            // Actually, if CDP fails, we probably can't do much.
            if (client) {
                try { await client.detach(); } catch (e) { /* ignore */ }
            }
            throw new Error(`CDP Screenshot failed: ${String(error)}`);
        }
    }
}
