import type { IPerceptionSource, ScreenshotOptions } from '@domain/ports/perception/IPerceptionSource';
import type { RoleRefMap, RoleRef } from '@domain/value-objects/RoleRef';

/** The slice of a webdriverio mobile session the perception source needs. */
export interface AppiumPerceptionBrowser {
    getPageSource(): Promise<string>;
    takeScreenshot(): Promise<string>;
    getWindowSize(): Promise<{ width: number; height: number }>;
}

export interface AppiumPerceptionDeps {
    getSession(): AppiumPerceptionBrowser | null;
    getUrl(): string;
    setRefs(refs: RoleRefMap): void;
}

const MAX_ELEMENTS = 200;

/**
 * Native apps have no DOM: read the accessibility hierarchy via getPageSource() (XML)
 * and normalize it to a ref-tagged element list. Refs key to the accessibility id
 * (content-desc on Android, name on iOS) so click/type resolve via `~<id>`.
 * evaluateScript is unsupported (no JS runtime; DOM-only tools are gated out).
 */
export class AppiumPerceptionSource implements IPerceptionSource {
    constructor(private readonly deps: AppiumPerceptionDeps) {}

    getUrl(): string {
        return this.deps.getUrl();
    }

    async getTitle(): Promise<string> {
        return this.deps.getUrl();
    }

    async captureScreenshot(_options?: ScreenshotOptions): Promise<Buffer> {
        const session = this.deps.getSession();
        if (!session) throw new Error('[AppiumPerceptionSource] No active Appium session');
        const base64 = await session.takeScreenshot();
        return Buffer.from(base64, 'base64');
    }

    async evaluateScript<T>(_pageFunction: string | ((...args: unknown[]) => T)): Promise<T> {
        throw new Error('[AppiumPerceptionSource] evaluateScript is not supported on native mobile (no JS runtime).');
    }

    async getAriaSnapshot(): Promise<string> {
        const session = this.deps.getSession();
        if (!session) return '';
        const xml = await session.getPageSource();
        const { lines, refs } = parseAccessibilityTree(xml);
        this.deps.setRefs(refs);
        return lines.join('\n');
    }

    async waitForContentReady(_timeout?: number): Promise<void> {
        return undefined;
    }

    getViewportSize(): { width: number; height: number } | null {
        return null;
    }
}

interface ParsedElement { role: string; name: string; text: string }

/** Dependency-free flat parse of Appium page-source XML to a ref-tagged listing (named/text-bearing elements only). */
export function parseAccessibilityTree(xml: string): { lines: string[]; refs: RoleRefMap } {
    const lines: string[] = [];
    const refs: Record<string, RoleRef> = {};
    let counter = 0;

    const tagRe = /<([A-Za-z][\w.]*)\s+([^>]*?)\/?>/g;
    let match: RegExpExecArray | null;
    while ((match = tagRe.exec(xml)) !== null && counter < MAX_ELEMENTS) {
        const tagName = match[1] ?? '';
        const attrs = parseAttrs(match[2] ?? '');
        const el = toElement(tagName, attrs);
        if (!el.name && !el.text) continue;

        counter += 1;
        const ref = `e${counter}`;
        refs[ref] = { role: el.role, ...(el.name ? { name: el.name } : {}) };

        const namePart = el.name ? ` "${el.name}"` : '';
        const textPart = el.text && el.text !== el.name ? ` text=${JSON.stringify(el.text)}` : '';
        lines.push(`- ${el.role}${namePart}${textPart} [ref=${ref}]`);
    }

    if (lines.length === 0) lines.push('(no named or text-bearing elements found in the current screen)');
    return { lines, refs };
}

function parseAttrs(raw: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const attrRe = /([\w:-]+)="([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(raw)) !== null) {
        if (m[1]) attrs[m[1]] = m[2] ?? '';
    }
    return attrs;
}

function toElement(tagName: string, attrs: Record<string, string>): ParsedElement {
    const role = attrs['class'] || tagName;
    // Accessibility id used by the `~` selector: content-desc (Android) / name (iOS).
    const name = attrs['content-desc'] || attrs['name'] || '';
    const text = attrs['text'] || attrs['label'] || attrs['value'] || '';
    return { role, name, text };
}
