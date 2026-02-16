import { injectable } from 'tsyringe';
import { Page } from 'playwright';

export interface RawElement {
    id: number;
    tag: string;
    role: string | null;
    text: string;
    attributes: Record<string, string>;
    isInteractive: boolean;
    boundingBox: { x: number; y: number; width: number; height: number } | null;
}

@injectable()
export class DomScanner {

    /**
     * Injects a script into the page to identify and extract interactive elements.
     * Returns raw data that needs to be mapped to domain objects.
     */
    async scan(page: Page): Promise<RawElement[]> {
        const extractionScript = `
            (() => {
                const selectors = [
                    'a', 'button', 'input', 'textarea', 'select',
                    '[role="button"]', '[role="link"]', '[role="checkbox"]',
                    '[role="radio"]', '[role="textbox"]', '[onclick]'
                ];

                const elements = [];
                let idCounter = 0;

                function isVisible(el) {
                    const style = getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
                }

                function getTextContent(el) {
                    return (el.textContent?.trim() || '').slice(0, 100);
                }

                function extractAttrs(el) {
                    const attrs = {};
                    const relevantAttrs = [
                        'id', 'name', 'type', 'placeholder', 'aria-label', 'href',
                        'value', 'title', 'checked', 'aria-invalid', 'aria-pressed',
                        'data-state', 'data-theme', 'aria-expanded', 'aria-hidden', 'class'
                    ];
                    relevantAttrs.forEach((attr) => {
                        let val = el.getAttribute(attr);
                        if (attr === 'value' && el.value) val = el.value;
                        if (attr === 'checked' && el.checked) val = 'true';
                        if (val) attrs[attr] = val;
                    });
                    return attrs;
                }

                const seen = new Set();

                for (const selector of selectors) {
                    document.querySelectorAll(selector).forEach((node) => {
                        if (seen.has(node)) return;
                        seen.add(node);

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
            })()
        `;

        try {
            return await page.evaluate(extractionScript) as RawElement[];
        } catch (error) {
            console.warn(`[DomScanner] Scan failed: ${error}`);
            return [];
        }
    }
}
