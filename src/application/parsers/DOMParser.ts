import { injectable, inject } from 'tsyringe';
import { Page } from 'playwright';
import { IContextParser } from './IContextParser';
import { DOMElement, ElementIdFactory } from '@domain/value-objects';
import type { ILogger } from '@domain/ports';

interface RawElement {
    id: number;
    tag: string;
    role: string | null;
    text: string;
    attributes: Record<string, string>;
    isInteractive: boolean;
    boundingBox: { x: number; y: number; width: number; height: number } | null;
}

@injectable()
export class DOMParser implements IContextParser<DOMElement[]> {
    constructor(@inject('ILogger') private logger: ILogger) { }

    async parse(page: Page): Promise<DOMElement[]> {
        this.logger.debug('[DOMParser] Extracting interactive elements');

        const raw = await page.evaluate((): RawElement[] => {
            const selectors = [
                'a', 'button', 'input', 'textarea', 'select',
                '[role="button"]', '[role="link"]', '[role="checkbox"]',
                '[role="radio"]', '[role="textbox"]', '[onclick]',
            ];

            const elements: RawElement[] = [];
            let idCounter = 0;

            function isVisible(el: HTMLElement): boolean {
                const style = getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
            }

            function getTextContent(el: HTMLElement): string {
                return (el.textContent?.trim() || '').slice(0, 100);
            }

            function extractAttrs(el: HTMLElement): Record<string, string> {
                const attrs: Record<string, string> = {};
                ['id', 'name', 'type', 'placeholder', 'aria-label', 'href', 'value'].forEach((attr) => {
                    const val = el.getAttribute(attr);
                    if (val) attrs[attr] = val;
                });
                return attrs;
            }

            for (const selector of selectors) {
                document.querySelectorAll(selector).forEach((node) => {
                    if (!(node instanceof HTMLElement) || !isVisible(node)) return;
                    const id = idCounter++;
                    node.setAttribute('data-autoqa-id', String(id));
                    const rect = node.getBoundingClientRect();
                    elements.push({
                        id,
                        tag: node.tagName.toLowerCase(),
                        role: node.getAttribute('role'),
                        text: getTextContent(node),
                        attributes: extractAttrs(node),
                        isInteractive: true,
                        boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                    });
                });
            }

            return elements;
        });

        const elements = raw.map((el): DOMElement => ({
            id: ElementIdFactory.unsafe(el.id),
            tag: el.tag,
            role: el.role,
            text: el.text,
            attributes: el.attributes,
            isInteractive: el.isInteractive,
            boundingBox: el.boundingBox,
        }));

        this.logger.debug(`[DOMParser] Extracted ${elements.length} elements`);
        return elements;
    }
}
