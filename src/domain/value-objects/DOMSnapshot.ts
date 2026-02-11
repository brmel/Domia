import type { ElementId } from './Brand';

/**
 * DOMSnapshot Value Object
 * Represents a simplified view of the page DOM for LLM consumption
 */
export interface DOMElement {
    readonly id: ElementId;
    readonly tag: string;
    readonly role: string | null;
    readonly text: string;
    readonly attributes: Readonly<Record<string, string>>;
    readonly isInteractive: boolean;
    readonly boundingBox: BoundingBox | null;
}

export interface BoundingBox {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface DOMSnapshot {
    readonly url: string;
    readonly title: string;
    readonly rootElements: {
        readonly html: Readonly<Record<string, string>>;
        readonly body: Readonly<Record<string, string>>;
    };
    readonly elements: readonly DOMElement[];
    readonly accessibilityTree?: import('./AriaNode').AriaNode | null;
    readonly screenshot?: string | undefined; // Primary (legacy)
    readonly screenshots?: string[]; // All available screenshots
    readonly timestamp: Date;
}

export const DOMSnapshot = {
    create(params: {
        url: string;
        title: string;
        rootElements: {
            html: Record<string, string>;
            body: Record<string, string>;
        };
        elements: DOMElement[];
        screenshot?: string | undefined;
    }): DOMSnapshot {
        return {
            url: params.url,
            title: params.title,
            rootElements: {
                html: Object.freeze(params.rootElements.html),
                body: Object.freeze(params.rootElements.body),
            },
            elements: Object.freeze(params.elements),
            screenshot: params.screenshot,
            timestamp: new Date(),
        };
    },
};
