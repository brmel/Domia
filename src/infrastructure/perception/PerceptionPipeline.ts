import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { IPerceptionPipeline } from '@domain/ports/IPerceptionPipeline';
import type { IPerceptionSource } from '@domain/ports/IPerceptionSource';
import type { ILogger } from '@domain/ports';
import { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import { SnapshotError } from '@domain/errors';
import { v4 as uuidv4 } from 'uuid';
import { VisionSensor } from './sensors/VisionSensor';
import { AriaSensor } from './sensors/AriaSensor';
import { buildRoleSnapshot } from './RoleRefResolver';
import { VisualContext } from '../../domain/value-objects/VisualContext';

@injectable()
export class PerceptionPipeline implements IPerceptionPipeline {
    constructor(
        @inject('ILogger') private logger: ILogger,
        @inject(VisionSensor) private visionSensor: VisionSensor,
        @inject(AriaSensor) private ariaSensor: AriaSensor
    ) { }

    capture(
        source: IPerceptionSource,
        options: import('@domain/ports/IPerceptionPipeline').PerceptionOptions = { vision: true, aria: true }
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
            options.aria !== false ? this.ariaSensor.capture(source) : Promise.resolve(''),
            source.getTitle().catch(() => ''),
        ]).then(([vision, ariaText, title]) => ({ vision, ariaText, title }));

        return ResultAsync.fromPromise(
            capturePromise,
            e => new SnapshotError(`Sensor capture failed: ${String(e)}`)
        ).map(({ vision, ariaText, title }) => {
            const { snapshot, refs } = buildRoleSnapshot(ariaText);
            const viewport = source.getViewportSize() ?? { width: 0, height: 0 };

            const frame: PerceptionFrame = {
                id: uuidv4(),
                timestamp: Date.now(),
                metadata: {
                    url: source.getUrl(),
                    title,
                    viewport
                },
                vision: new VisualContext(vision.screenshots, 'image/jpeg'),
                semantic: {
                    ariaSnapshot: snapshot,
                    refs
                }
            };
            return frame;
        });
    }
}
