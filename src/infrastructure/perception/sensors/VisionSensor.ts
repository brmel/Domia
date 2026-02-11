import { injectable, inject } from 'tsyringe';
import { Page } from 'playwright';
import { ISensor } from '@domain/ports/ISensor';
import { SmartScrollCapture } from '../SmartScrollCapture';


@injectable()
export class VisionSensor implements ISensor<{ screenshots: Buffer[]; mimeType: string }> {
    public readonly name = 'VisionSensor';

    constructor(
        @inject(SmartScrollCapture) private smartCapture: SmartScrollCapture
    ) { }

    async capture(page: Page): Promise<{ screenshots: Buffer[]; mimeType: string }> {
        const screenshots = await this.smartCapture.capture(page);

        // Fallback if capture returns empty (shouldn't happen but for type safety)
        if (screenshots.length === 0) {
            return { screenshots: [], mimeType: 'image/jpeg' };
        }

        return {
            screenshots,
            mimeType: 'image/jpeg'
        };
    }
}
