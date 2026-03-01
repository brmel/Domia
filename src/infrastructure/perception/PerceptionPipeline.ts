import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { IPerceptionPipeline } from '@domain/ports/IPerceptionPipeline';
import type { IPerceptionSource } from '@domain/ports/IPerceptionSource';

import type { ILogger } from '@domain/ports';
import { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import { SnapshotError } from '@domain/errors';
import { v4 as uuidv4 } from 'uuid';
import { VisionSensor } from './sensors/VisionSensor';
import { DomSensor } from './sensors/DomSensor';
import { AriaSensor } from './sensors/AriaSensor';
import { VisualContext } from '../../domain/value-objects/VisualContext';

@injectable()
export class PerceptionPipeline implements IPerceptionPipeline {
    constructor(
        @inject('ILogger') private logger: ILogger,
        @inject(VisionSensor) private visionSensor: VisionSensor,
        @inject(DomSensor) private domSensor: DomSensor,
        @inject(AriaSensor) private ariaSensor: AriaSensor
    ) { }

    capture(
        source: IPerceptionSource,
        options: import('@domain/ports/IPerceptionPipeline').PerceptionOptions = { vision: true, aria: true, dom: true }
    ): ResultAsync<PerceptionFrame, SnapshotError> {
        this.logger.info(`[PerceptionPipeline] Starting capture sequence (Options: ${JSON.stringify(options)})`);

        if (!source) {
            return ResultAsync.fromPromise(
                Promise.reject(new Error('No perception source provided.')),
                e => new SnapshotError(`Sensor capture failed: ${String(e)}`)
            );
        }

        const capturePromise = Promise.all([
            options.vision ? this.visionSensor.capture(source) : Promise.resolve({ screenshots: [], mimeType: 'image/jpeg' }),
            options.aria ? this.ariaSensor.capture(source) : Promise.resolve(null),
            options.dom ? this.domSensor.capture(source) : Promise.resolve(Object.freeze({
                url: source.getUrl(),
                title: '',
                rootElements: {
                    html: {},
                    body: {}
                },
                elements: [],
                timestamp: new Date()
            }))
        ]).then(([vision, aria, dom]) => ({ vision, aria, dom }));

        return ResultAsync.fromPromise(
            capturePromise,
            e => new SnapshotError(`Sensor capture failed: ${String(e)}`)
        ).map(({ vision, aria, dom }) => {
            const frame: PerceptionFrame = {
                id: uuidv4(),
                timestamp: Date.now(),
                metadata: {
                    url: dom.url,
                    title: dom.title,
                    viewport: { width: 0, height: 0 }
                },
                vision: new VisualContext(vision.screenshots, 'image/jpeg'),
                semantic: {
                    dom,
                    accessibility: aria
                }
            };
            return frame;
        });
    }
}
