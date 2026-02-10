import { injectable, inject, injectAll } from 'tsyringe';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { IPerceptionPipeline } from '@domain/ports/IPerceptionPipeline';
import type { ISensor } from '@domain/ports/ISensor';
import { ILogger } from '@domain/ports';
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
        @injectAll('ISensor') private sensors: ISensor<any>[],
        @inject(VisionSensor) private visionSensor: VisionSensor,
        @inject(DomSensor) private domSensor: DomSensor,
        @inject(AriaSensor) private ariaSensor: AriaSensor
    ) { }

    capture(): ResultAsync<PerceptionFrame, SnapshotError> {
        this.logger.info('[PerceptionPipeline] Starting capture sequence');

        // Phase 1: Paused Capture (Vision, Aria)
        return this.browser.pause()
            .mapErr(e => new SnapshotError(`Failed to pause browser: ${e.message}`))
            .andThen(() => {
                this.logger.info('[PerceptionPipeline] Browser paused. Capturing Vision and Aria.');
                const adapter = this.browser as any;
                if (!adapter.page) {
                    return errAsync(new SnapshotError('Browser page not available'));
                }
                const page = adapter.page;

                // Execute Vision and Aria sensors in parallel while paused
                return ResultAsync.fromPromise(
                    Promise.all([
                        this.visionSensor.capture(page),
                        // this.ariaSensor.capture(page)
                        Promise.resolve(null)
                    ]),
                    e => new SnapshotError(`Paused sensor capture failed: ${String(e)}`)
                );
                // return okAsync([{ screenshot: Buffer.from(''), mimeType: '' }, null] as const);
            })
            .andThen(([vision, aria]) => {
                this.logger.info('[PerceptionPipeline] Vision and Aria captured. Resuming browser.');
                // Phase 2: Resume
                return this.browser.resume()
                    .orElse(e => {
                        // If the browser is not paused (e.g. seemingly resumed by side-effect), 
                        // Debugger.resume throws "Can only perform operation while paused".
                        // We can safely ignore this as our goal is to be in a resumed state.
                        if (String(e).includes('Can only perform operation while paused')) {
                            this.logger.info('[PerceptionPipeline] Browser already resumed (ignoring redundant resume error).');
                            return okAsync(undefined);
                        }
                        return errAsync(new SnapshotError(`Failed to resume browser: ${String(e)}`));
                    })
                    .map(() => ({ vision, aria }));
            })
            .orElse(error => {
                this.logger.error(`[PerceptionPipeline] Capture failed during pause/resume: ${error.message}`);
                // If capture failed, we must try to resume.
                return this.browser.resume()
                    .orElse(e => {
                        if (String(e).includes('Can only perform operation while paused')) {
                            return okAsync(undefined);
                        }
                        return errAsync(new SnapshotError(`Failed to resume (${e}) after error: ${error.message}`));
                    })
                    .andThen(() => errAsync(error));
            })
            .andThen(({ vision, aria }) => {
                this.logger.info('[PerceptionPipeline] Browser resumed. Capturing DOM.');
                // Phase 3: Resumed Capture (DOM)
                const adapter = this.browser as any;
                const page = adapter.page;

                return ResultAsync.fromPromise(
                    this.domSensor.capture(page),
                    e => new SnapshotError(`Dom sensor capture failed: ${String(e)}`)
                ).map(dom => ({ vision, aria, dom }));
            })
            .map(({ vision, aria, dom }) => {
                this.logger.info('[PerceptionPipeline] DOM captured. Aggregating frame.');
                // Aggregation
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
