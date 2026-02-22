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

    async scan(page: Page): Promise<RawElement[]> {
        const extractionScript = `
            (() => {
                // Phase 1: query explicit interactive selectors
                const explicitSelectors = [
                    'a', 'button', 'input', 'textarea', 'select',
                    '[role="button"]', '[role="link"]', '[role="checkbox"]',
                    '[role="radio"]', '[role="textbox"]', '[role="tab"]',
                    '[role="menuitem"]', '[role="option"]', '[role="switch"]',
                    '[role="combobox"]', '[role="listbox"]', '[role="menu"]',
                    '[role="navigation"] > *', '[role="tablist"] > *',
                    '[onclick]', '[tabindex]', '[contenteditable="true"]',
                    'summary', 'details',
                    'nav a', 'nav button', 'nav [role="button"]',
                    '[data-action]', '[data-click]', '[data-href]',
                    '[aria-haspopup]'
                ];

                const MAX_ELEMENTS = 80;
                const elements = [];
                let idCounter = 0;

                function isVisible(el) {
                    const style = getComputedStyle(el);
                    if (style.display === 'none' || style.visibility === 'hidden') return false;
                    if (parseFloat(style.opacity) === 0) return false;
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                }

                function getTextContent(el) {
                    // Prefer aria-label, then direct text, then alt/title
                    const ariaLabel = el.getAttribute('aria-label');
                    if (ariaLabel) return ariaLabel.trim().slice(0, 100);
                    // Get only shallow text (not deep children text that's noisy)
                    let text = '';
                    for (const child of el.childNodes) {
                        if (child.nodeType === Node.TEXT_NODE) {
                            text += child.textContent;
                        }
                    }
                    text = text.trim();
                    if (text.length > 0) return text.slice(0, 100);
                    // Use full textContent as default
                    return (el.textContent?.trim() || '').slice(0, 100);
                }

                function extractAttrs(el) {
                    const attrs = {};
                    const relevantAttrs = [
                        'id', 'name', 'type', 'placeholder', 'aria-label', 'href',
                        'value', 'title', 'checked', 'aria-invalid', 'aria-pressed',
                        'data-state', 'data-theme', 'aria-expanded', 'aria-hidden',
                        'class', 'lang', 'hreflang', 'data-lang', 'data-locale',
                        'aria-current', 'aria-selected', 'tabindex', 'role'
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

                function addElement(node, isExplicit) {
                    if (seen.has(node) || elements.length >= MAX_ELEMENTS) return;
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
                        isInteractive: isExplicit,
                        boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                    });
                }

                // Phase 1: explicit selectors
                for (const selector of explicitSelectors) {
                    try {
                        document.querySelectorAll(selector).forEach((node) => addElement(node, true));
                    } catch (_) { /* ignore invalid selectors */ }
                }

                // Phase 2: heuristic scan — find clickable-looking elements by
                // computed style (cursor: pointer) that were missed by selectors.
                // This catches framework-rendered components (React, Vue, Svelte)
                // where click handlers are attached via JS, not HTML attributes.
                if (elements.length < MAX_ELEMENTS) {
                    const candidates = document.querySelectorAll(
                        'div, span, li, p, img, svg, label, h1, h2, h3, h4, h5, h6, footer a, header a'
                    );
                    for (const node of candidates) {
                        if (elements.length >= MAX_ELEMENTS) break;
                        if (seen.has(node) || !(node instanceof HTMLElement) || !isVisible(node)) continue;
                        const style = getComputedStyle(node);
                        const looksClickable = style.cursor === 'pointer'
                            || node.hasAttribute('tabindex')
                            || node.getAttribute('draggable') === 'true';
                        if (looksClickable) {
                            addElement(node, true);
                        }
                    }
                }

                return elements;
            })()
        `;

        try {
            return await page.evaluate(extractionScript) as RawElement[];
        } catch (_) {
            return [];
        }
    }
}
