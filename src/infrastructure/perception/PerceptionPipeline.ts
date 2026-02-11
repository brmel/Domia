import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { IPerceptionPipeline } from '@domain/ports/IPerceptionPipeline';

import type { ILogger } from '@domain/ports';
import { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import type { IBrowserAutomation } from '../../domain/ports/IBrowserAutomation';
import { SnapshotError } from '@domain/errors';
import { v4 as uuidv4 } from 'uuid';
import { VisionSensor } from './sensors/VisionSensor';
import { DomSensor } from './sensors/DomSensor';
import { AriaSensor } from './sensors/AriaSensor';
import { VisualContext } from '../../domain/value-objects/VisualContext';

@injectable()
export class PerceptionPipeline implements IPerceptionPipeline {
    constructor(
        @inject('IBrowserAutomation') private browser: IBrowserAutomation,
        @inject('ILogger') private logger: ILogger,
        @inject(VisionSensor) private visionSensor: VisionSensor,
        @inject(DomSensor) private domSensor: DomSensor,
        @inject(AriaSensor) private ariaSensor: AriaSensor
    ) { }

    capture(options: import('@domain/ports/IPerceptionPipeline').PerceptionOptions = { vision: true, aria: true, dom: true }): ResultAsync<PerceptionFrame, SnapshotError> {
        this.logger.info(`[PerceptionPipeline] Starting capture sequence (Options: ${JSON.stringify(options)})`);

        // Simplified capture without pausing to improve stability
        const adapter = this.browser as any;
        const page = adapter.page;

        const capturePromise = page
            ? Promise.all([
                options.vision ? this.visionSensor.capture(page) : Promise.resolve({ screenshots: [], mimeType: '' }),
                options.aria ? this.ariaSensor.capture(page) : Promise.resolve(null),
                options.dom ? this.domSensor.capture(page) : Promise.resolve(Object.freeze({ url: '', title: '', rootElements: [], elements: [], timestamp: new Date() }))
            ]).then(([vision, aria, dom]) => ({ vision, aria, dom }))
            : Promise.resolve({
                vision: { screenshots: [], mimeType: '' },
                aria: null,
                dom: null as any
            });

        return ResultAsync.fromPromise(
            capturePromise,
            e => new SnapshotError(`Sensor capture failed: ${String(e)}`)
        ).map(({ vision, aria, dom }) => {
            const frame: PerceptionFrame = {
                id: uuidv4(),
                timestamp: Date.now(),
                metadata: {
                    url: dom?.url || '',
                    title: dom?.title || '',
                    viewport: { width: 0, height: 0 }
                },
                vision: new VisualContext(vision.screenshots, 'image/jpeg'),
                semantic: {
                    dom: dom as any, // Cast to avoid strict null checks on the resolution fallback
                    accessibility: aria
                }
            };
            return frame;
        });
    }
}
