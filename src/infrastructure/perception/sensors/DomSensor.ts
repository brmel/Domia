import { injectable, inject } from 'tsyringe';
import { Page } from 'playwright';
import { ISensor } from '@domain/ports/ISensor';
import { ILogger } from '@domain/ports';
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
        this.logger.info('[DomSensor] Capture started');
        try {
            const [elements, metadata] = await Promise.all([
                this.domParser.parse(page),
                this.metadataParser.parse(page)
            ]);
            this.logger.info('[DomSensor] Parse complete');

            return {
                url: metadata.url,
                title: metadata.title,
                rootElements: Object.freeze(metadata.rootElements),
                elements: Object.freeze(elements),
                timestamp: new Date()
                // accessibilityTree and screenshot are handled by other sensors/pipeline aggregation
            };
        } catch (e) {
            this.logger.error(`[DomSensor] Capture failed: ${e}`);
            throw e;
        }
    }
}
