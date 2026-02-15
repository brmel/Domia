import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { IPerceptionPipeline } from '@domain/ports/IPerceptionPipeline';
import type { Page } from 'playwright';

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
        @inject('ILogger') private logger: ILogger,
        @inject(VisionSensor) private visionSensor: VisionSensor,
        @inject(DomSensor) private domSensor: DomSensor,
        @inject(AriaSensor) private ariaSensor: AriaSensor
    ) { }

    capture(
        browser: IBrowserAutomation,
        options: import('@domain/ports/IPerceptionPipeline').PerceptionOptions = { vision: true, aria: true, dom: true }
    ): ResultAsync<PerceptionFrame, SnapshotError> {
        this.logger.info(`[PerceptionPipeline] Starting capture sequence (Options: ${JSON.stringify(options)})`);
        const page = this.resolvePage(browser);

        if (!page) {
            return ResultAsync.fromPromise(
                Promise.reject(new Error('Browser automation does not expose an active page for perception capture.')),
                e => new SnapshotError(`Sensor capture failed: ${String(e)}`)
            );
        }

        const capturePromise = Promise.all([
            options.vision ? this.visionSensor.capture(page) : Promise.resolve({ screenshots: [], mimeType: 'image/jpeg' }),
            options.aria ? this.ariaSensor.capture(page) : Promise.resolve(null),
            options.dom ? this.domSensor.capture(page) : Promise.resolve(Object.freeze({
                url: page.url(),
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

    private resolvePage(browser: IBrowserAutomation): Page | null {
        const candidate = browser as unknown as { getPage?: () => unknown; page?: unknown };

        if (typeof candidate.getPage === 'function') {
            const resolved = candidate.getPage();
            if (this.isPage(resolved)) {
                return resolved;
            }
        }

        if (this.isPage(candidate.page)) {
            return candidate.page;
        }

        return null;
    }

    private isPage(value: unknown): value is Page {
        if (!value || typeof value !== 'object') {
            return false;
        }

        const pageCandidate = value as Partial<Page>;
        return typeof pageCandidate.url === 'function'
            && typeof pageCandidate.screenshot === 'function'
            && typeof pageCandidate.evaluate === 'function';
    }
}
