import { injectable, inject } from 'tsyringe';
import type { IPerceptionSource } from '@domain/ports/IPerceptionSource';
import { ISensor } from '@domain/ports/ISensor';
import { SmartScrollCapture } from '../SmartScrollCapture';


@injectable()
export class VisionSensor implements ISensor<{ screenshots: Buffer[]; mimeType: string }> {
    public readonly name = 'VisionSensor';

    constructor(
        @inject(SmartScrollCapture) private smartCapture: SmartScrollCapture
    ) { }

    async capture(source: IPerceptionSource): Promise<{ screenshots: Buffer[]; mimeType: string }> {
        const screenshots = await this.smartCapture.capture(source);

        return {
            screenshots,
            mimeType: 'image/jpeg'
        };
    }
}
