import { injectable, inject } from 'tsyringe';
import { ResultAsync, errAsync } from 'neverthrow';
import { IPerceptionPipeline } from '@domain/ports/perception/IPerceptionPipeline';
import type { IPerceptionSource } from '@domain/ports/perception/IPerceptionSource';
import type { ILogger } from '@domain/ports';
import { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import { SnapshotError } from '@domain/errors';
import { randomUUID } from 'crypto';
import { VisionSensor } from './sensors/VisionSensor';
import { AriaSensor } from '@infrastructure/playwright/perception/AriaSensor';
import { buildRoleSnapshot } from '@infrastructure/playwright/perception/RoleRefResolver';
import { VisualContext } from '@domain/value-objects/VisualContext';

@injectable()
export class PerceptionPipeline implements IPerceptionPipeline {
    constructor(
        @inject('ILogger') private logger: ILogger,
        @inject(VisionSensor) private visionSensor: VisionSensor,
        @inject(AriaSensor) private ariaSensor: AriaSensor
    ) { }

    capture(
        source: IPerceptionSource,
        options: import('@domain/ports/perception/IPerceptionPipeline').PerceptionOptions = { vision: true, aria: true }
    ): ResultAsync<PerceptionFrame, SnapshotError> {
        const start = Date.now();
        this.logger.info(`[PerceptionPipeline] Starting capture (vision=${!!options.vision}, aria=${options.aria !== false})`);

        if (!source) {
            return errAsync(new SnapshotError('No perception source provided.'));
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
            const refCount = Object.keys(refs).length;
            this.logger.info(`[PerceptionPipeline] Capture complete in ${Date.now() - start}ms: ${refCount} refs, url=${source.getUrl()}`);

            const frame: PerceptionFrame = {
                id: randomUUID(),
                timestamp: Date.now(),
                captureDurationMs: Date.now() - start,
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
