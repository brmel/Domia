import { injectable, inject } from 'tsyringe';
import type { IPerceptionSource } from '@domain/ports/IPerceptionSource';
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
export class MetadataParser {
    constructor(@inject('ILogger') private logger: ILogger) { }

    async parse(source: IPerceptionSource): Promise<PageMetadata> {
        this.logger.debug('[MetadataParser] Extracting metadata');

        const url = source.getUrl();
        const title = await source.getTitle();
        const rootElements = await source.evaluateScript(`
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
