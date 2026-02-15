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

        return {
            screenshots,
            mimeType: 'image/jpeg'
        };
    }
}
