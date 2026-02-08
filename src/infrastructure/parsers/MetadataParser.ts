import { injectable, inject } from 'tsyringe';
import { Page } from 'playwright';
import { IContextParser } from './IContextParser';
import type { ILogger } from '@domain/ports';

export interface PageMetadata {
    url: string;
    title: string;
    rootElements: {
        html: Record<string, string>;
        body: Record<string, string>;
    };
}

@injectable()
export class MetadataParser implements IContextParser<PageMetadata> {
    constructor(@inject('ILogger') private logger: ILogger) { }

    async parse(page: Page): Promise<PageMetadata> {
        this.logger.debug('[MetadataParser] Extracting metadata');

        const url = page.url();
        const title = await page.title();
        const rootElements = await page.evaluate(`
            (() => {
                const getAttrs = (el) => {
                    const attrs = {};
                    for (const attr of el.attributes) {
                        attrs[attr.name] = attr.value;
                    }
                    return attrs;
                };
                return {
                    html: getAttrs(document.documentElement),
                    body: getAttrs(document.body)
                };
            })()
        `) as { html: Record<string, string>; body: Record<string, string> };

        return { url, title, rootElements };
    }
}
