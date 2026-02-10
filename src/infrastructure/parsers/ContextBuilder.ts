import { injectable, inject } from 'tsyringe';
import { Page } from 'playwright';
import { DOMParser } from './DOMParser';
import { MetadataParser } from './MetadataParser';
import { DOMSnapshot } from '@domain/value-objects';
import { SnapshotError } from '@domain/errors';

import { ConfigService } from '../../infrastructure/config/ConfigService';

@injectable()
export class ContextBuilder {
    constructor(
        @inject(DOMParser) private domParser: DOMParser,
        @inject(MetadataParser) private metadataParser: MetadataParser,
        @inject(ConfigService) private configService: ConfigService
    ) { }

    async buildSnapshot(page: Page): Promise<DOMSnapshot> {
        try {
            const config = this.configService.get();
            const shouldCaptureScreenshot = config.ai.debugScreenshots;

            const [elements, metadata, accessibilityTree, screenshot] = await Promise.all([
                this.domParser.parse(page),
                this.metadataParser.parse(page),
                ((page as unknown as { accessibility: { snapshot: (options: { interestingOnly: boolean }) => Promise<unknown> } }).accessibility
                    ? (page as unknown as { accessibility: { snapshot: (options: { interestingOnly: boolean }) => Promise<unknown> } }).accessibility.snapshot({ interestingOnly: false })
                    : Promise.resolve(null)),
                shouldCaptureScreenshot
                    ? page.screenshot({ type: 'jpeg', quality: 50, fullPage: false }).then(buffer => buffer.toString('base64'))
                    : Promise.resolve(undefined)
            ]);

            return {
                url: metadata.url,
                title: metadata.title,
                rootElements: metadata.rootElements,
                elements: Object.freeze(elements),
                accessibilityTree: accessibilityTree as import('../../domain/value-objects/AriaNode').AriaNode,
                screenshot: screenshot,
                timestamp: new Date()
            };
        } catch (error) {
            throw new SnapshotError(`Failed to build snapshot: ${String(error)}`);
        }
    }
}
