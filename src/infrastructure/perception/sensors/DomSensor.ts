import { injectable, inject } from 'tsyringe';
import type { IPerceptionSource } from '@domain/ports/IPerceptionSource';
import { ISensor } from '@domain/ports/ISensor';
import { DOMParser } from '../../parsers/DOMParser';
import { MetadataParser } from '../../parsers/MetadataParser';
import { DOMSnapshot } from '@domain/value-objects/DOMSnapshot';

@injectable()
export class DomSensor implements ISensor<DOMSnapshot> {
    public readonly name = 'DomSensor';

    constructor(
        @inject(DOMParser) private domParser: DOMParser,
        @inject(MetadataParser) private metadataParser: MetadataParser,
    ) { }

    async capture(source: IPerceptionSource): Promise<DOMSnapshot> {
        // Wait for the page to be ready before parsing so we never read
        // a mid-navigation / destroyed context.
        await source.waitForContentReady(5000);

        const [elements, metadata] = await Promise.all([
            this.domParser.parse(source),
            this.metadataParser.parse(source)
        ]);

        return {
            url: metadata.url,
            title: metadata.title,
            rootElements: Object.freeze(metadata.rootElements),
            elements: Object.freeze(elements),
            timestamp: new Date()
        };
    }
}
