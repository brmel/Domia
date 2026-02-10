import { injectable, inject } from 'tsyringe';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
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

    capture(): ResultAsync<PerceptionFrame, SnapshotError> {
        this.logger.info('[PerceptionPipeline] Starting capture sequence');

        return this.browser.pause()
            .mapErr(e => new SnapshotError(`Failed to pause browser: ${e.message}`))
            .andThen(() => {
                const adapter = this.browser as any;
                if (!adapter.page) {
                    return errAsync(new SnapshotError('Browser page not available'));
                }
                const page = adapter.page;

                return ResultAsync.fromPromise(
                    Promise.all([
                        this.visionSensor.capture(page),
                        this.ariaSensor.capture(page)
                    ]),
                    e => new SnapshotError(`Paused sensor capture failed: ${String(e)}`)
                );
            })
            .andThen(([vision, aria]) => {
                return this.browser.resume()
                    .orElse(e => {
                        if (String(e).includes('Can only perform operation while paused')) {
                            this.logger.info('[PerceptionPipeline] Browser already resumed.');
                            return okAsync(undefined);
                        }
                        return errAsync(new SnapshotError(`Failed to resume browser: ${String(e)}`));
                    })
                    .map(() => ({ vision, aria }));
            })
            .orElse(error => {
                this.logger.error(`[PerceptionPipeline] Capture failed during pause/resume: ${error.message}`);
                return this.browser.resume()
                    .orElse(e => {
                        if (String(e).includes('Can only perform operation while paused')) {
                            return okAsync(undefined);
                        }
                        return errAsync(new SnapshotError(`Failed to resume after error: ${error.message}`));
                    })
                    .andThen(() => errAsync(error));
            })
            .andThen(({ vision, aria }) => {
                const adapter = this.browser as any;
                const page = adapter.page;

                return ResultAsync.fromPromise(
                    this.domSensor.capture(page),
                    e => new SnapshotError(`Dom sensor capture failed: ${String(e)}`)
                ).map(dom => ({ vision, aria, dom }));
            })
            .map(({ vision, aria, dom }) => {
                const frame: PerceptionFrame = {
                    id: uuidv4(),
                    timestamp: Date.now(),
                    metadata: {
                        url: dom.url,
                        title: dom.title,
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
                return frame;
            });
    }
}
