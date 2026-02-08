import { injectable, inject } from 'tsyringe';
import { Page } from 'playwright';
import { IContextParser } from './IContextParser';
import type { ILogger } from '@domain/ports';

export interface PageMetadata {
    url: string;
    title: string;
    rootClasses: string;
}

@injectable()
export class MetadataParser implements IContextParser<PageMetadata> {
    constructor(@inject('ILogger') private logger: ILogger) { }

    async parse(page: Page): Promise<PageMetadata> {
        this.logger.debug('[MetadataParser] Extracting metadata');

        const url = page.url();
        const title = await page.title();
        const rootClasses = await page.evaluate(() => {
            return `html: ${document.documentElement.className} | body: ${document.body.className}`;
        });

        return { url, title, rootClasses };
    }
}
