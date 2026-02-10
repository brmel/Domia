import { injectable, inject } from 'tsyringe';
import { Page } from 'playwright';
import { ISensor } from '@domain/ports/ISensor';
import type { ILogger } from '@domain/ports';
import { DOMParser } from '../../parsers/DOMParser';
import { MetadataParser } from '../../parsers/MetadataParser';
import { DOMSnapshot } from '@domain/value-objects/DOMSnapshot';

@injectable()
export class DomSensor implements ISensor<DOMSnapshot> {
    public readonly name = 'DomSensor';

    constructor(
        @inject(DOMParser) private domParser: DOMParser,
        @inject(MetadataParser) private metadataParser: MetadataParser,
        @inject('ILogger') private logger: ILogger
    ) { }

    async capture(page: Page): Promise<DOMSnapshot> {
        let retries = 3;
        while (retries > 0) {
            try {
                const [elements, metadata] = await Promise.all([
                    this.domParser.parse(page),
                    this.metadataParser.parse(page)
                ]);

                return {
                    url: metadata.url,
                    title: metadata.title,
                    rootElements: Object.freeze(metadata.rootElements),
                    elements: Object.freeze(elements),
                    timestamp: new Date()
                };
            } catch (e) {
                const msg = String(e);
                if (msg.includes('Execution context was destroyed') || msg.includes('Target closed')) {
                    this.logger.warn(`[DomSensor] Execution context destroyed (navigation?), retrying... (${retries} left)`);
                    retries--;
                    if (retries > 0) {
                        try {
                            await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => { });
                        } catch (waitError) { /* ignore wait error */ }
                        continue;
                    }
                }
                this.logger.error(`[DomSensor] Capture failed: ${e}`);
                throw e;
            }
        }
        throw new Error('[DomSensor] Failed to capture after retries');
    }
}
