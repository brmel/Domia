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
            this.logger.error(`[DomSensor] Capture failed: ${e}`);
            throw e;
        }
    }
}
