import { injectable, inject } from 'tsyringe';
import { Page } from 'playwright';
import { DOMParser } from './DOMParser';
import { MetadataParser } from './MetadataParser';
import { DOMSnapshot } from '@domain/value-objects';
import { SnapshotError } from '@domain/errors';

@injectable()
export class ContextBuilder {
    constructor(
        @inject(DOMParser) private domParser: DOMParser,
        @inject(MetadataParser) private metadataParser: MetadataParser
    ) { }

    async buildSnapshot(page: Page): Promise<DOMSnapshot> {
        try {
            const [elements, metadata] = await Promise.all([
                this.domParser.parse(page),
                this.metadataParser.parse(page)
            ]);

            return {
                url: metadata.url,
                title: metadata.title,
                rootClasses: metadata.rootClasses,
                elements: Object.freeze(elements),
                timestamp: new Date()
            };
        } catch (error) {
            throw new SnapshotError(`Failed to build snapshot: ${String(error)}`);
        }
    }
}
