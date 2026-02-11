import { injectable, inject } from 'tsyringe';
import { Page } from 'playwright';
import { DOMElement, ElementIdFactory } from '@domain/value-objects';
import type { ILogger } from '@domain/ports';
import { DomScanner } from '../perception/DomScanner';

@injectable()
export class DOMParser {
    constructor(
        @inject('ILogger') private logger: ILogger,
        @inject(DomScanner) private domSensor: DomScanner
    ) { }

    async parse(page: Page): Promise<DOMElement[]> {
        this.logger.debug('[DOMParser] Extracting interactive elements');
        return this.doParse(page);
    }

    private async doParse(page: Page): Promise<DOMElement[]> {
        const raw = await this.domSensor.scan(page);

        const elements = raw.map((el): DOMElement => ({
            id: ElementIdFactory.unsafe(el.id),
            tag: el.tag,
            role: el.role,
            text: el.text,
            attributes: el.attributes,
            isInteractive: el.isInteractive,
            boundingBox: el.boundingBox || null,
        }));

        this.logger.debug(`[DOMParser] Extracted ${elements.length} elements`);
        return elements;
    }
}
