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

    capture(options: import('@domain/ports/IPerceptionPipeline').PerceptionOptions = { vision: true, aria: true, dom: true }): ResultAsync<PerceptionFrame, SnapshotError> {
        this.logger.info(`[PerceptionPipeline] Starting capture sequence (Options: ${JSON.stringify(options)})`);

        const needsPause = options.vision || options.aria;
        const initialCapture = needsPause
            ? this.browser.pause()
                .mapErr(e => new SnapshotError(`Failed to pause browser: ${e.message}`))
                .andThen(() => {
                    const adapter = this.browser as any;
                    if (!adapter.page) return errAsync(new SnapshotError('Browser page not available'));
                    const page = adapter.page;

                    if (page.isClosed()) {
                        return errAsync(new SnapshotError('Browser page is closed'));
                    }

                    return ResultAsync.fromPromise(
                        Promise.all([
                            options.vision ? this.visionSensor.capture(page) : Promise.resolve({ screenshot: Buffer.from(''), mimeType: '' }),
                            options.aria ? this.ariaSensor.capture(page) : Promise.resolve(null)
                        ]),
                        e => new SnapshotError(`Paused sensor capture failed: ${String(e)}`)
                    );
                })
                .andThen(([vision, aria]) => {
                    return this.browser.resume()
                        .orElse(e => {
                            // If resume fails because target is closed, log it but return the captured data if we have it? 
                            // Actually if we have data, we're good.
                            const msg = String(e);
                            if (msg.includes('Target page, context or browser has been closed')) {
                                this.logger.warn(`[PerceptionPipeline] Browser closed during resume, but capture succeeded.`);
                                return okAsync(undefined);
                            }
                            if (msg.includes('Can only perform operation while paused')) return okAsync(undefined);
                            return errAsync(new SnapshotError(`Failed to resume browser: ${msg}`));
                        })
                        .map(() => ({ vision, aria }));
                })
                .orElse(error => {
                    const msg = error.message || String(error);
                    if (msg.includes('Target page, context or browser has been closed')) {
                        this.logger.warn(`[PerceptionPipeline] Browser closed during capture sequence. Returning empty perception.`);
                        return okAsync({ vision: { screenshot: Buffer.from(''), mimeType: '' }, aria: null });
                    }

                    this.logger.error(`[PerceptionPipeline] Capture failed during pause/resume: ${msg}`);
                    // Attempt to resume if possible, but don't fail if resume fails
                    return this.browser.resume()
                        .orElse(() => okAsync(undefined))
                        .andThen(() => errAsync(error));
                })
            : okAsync({ vision: { screenshot: Buffer.from(''), mimeType: '' }, aria: null });

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
