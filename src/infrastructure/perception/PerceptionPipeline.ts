import { injectable, inject } from 'tsyringe';
import { ResultAsync, okAsync } from 'neverthrow';
import { IPerceptionPipeline } from '@domain/ports/IPerceptionPipeline';

import type { ILogger } from '@domain/ports';
import { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import type { IBrowserAutomation } from '../../domain/ports/IBrowserAutomation';
import { SnapshotError } from '@domain/errors';
import { v4 as uuidv4 } from 'uuid';
import { VisionSensor } from './sensors/VisionSensor';
import { DomSensor } from './sensors/DomSensor';
import { AriaSensor } from './sensors/AriaSensor';

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
                options.vision ? this.visionSensor.capture(page) : Promise.resolve({ screenshot: Buffer.from(''), mimeType: '' }),
                options.aria ? this.ariaSensor.capture(page) : Promise.resolve(null)
            ]).then(([vision, aria]) => ({ vision, aria }))
            : Promise.resolve({ vision: { screenshot: Buffer.from(''), mimeType: '' }, aria: null });

        // Wrap in ResultAsync to match existing flow
        const initialCapture = ResultAsync.fromPromise(
            capturePromise,
            e => new SnapshotError(`Sensor capture failed: ${String(e)}`)
        );

        return initialCapture.andThen(({ vision, aria }) => {
            const adapter = this.browser as any;
            const page = adapter.page;

            if (!options.dom) {
                return okAsync({ vision, aria, dom: null as any });
            }

            return ResultAsync.fromPromise(
                this.domSensor.capture(page),
                e => new SnapshotError(`Dom sensor capture failed: ${String(e)}`)
            ).map(dom => ({ vision, aria, dom }));
        }).andThen(({ vision, aria, dom }) => {
            const frame: PerceptionFrame = {
                id: uuidv4(),
                timestamp: Date.now(),
                metadata: {
                    url: dom?.url || '',
                    title: dom?.title || '',
                    viewport: { width: 0, height: 0 }
                },
                vision: {
                    screenshot: vision.screenshot,
                    mimeType: 'image/jpeg'
                },
                semantic: {
                    dom: dom,
                    accessibility: aria
                }
            };

            // Trace Data Point 1: Sensor Extraction
            // We don't have stepNumber here, but we can pass a partial trace.
            // Actually, PerceptionPipeline doesn't know the step number easily.
            // StepExecutor knows. We should probably trace reasoning in StepExecutor.
            // But we can trace sensor density here.

            return okAsync(frame);
        });
    }
}
