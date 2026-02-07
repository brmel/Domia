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
    readonly rootClasses: string;
    readonly elements: readonly DOMElement[];
    readonly timestamp: Date;
}

export const DOMSnapshot = {
    create(params: {
        url: string;
        title: string;
        rootClasses: string;
        elements: DOMElement[];
    }): DOMSnapshot {
        return {
            url: params.url,
            title: params.title,
            rootClasses: params.rootClasses,
            elements: Object.freeze(params.elements),
            timestamp: new Date(),
        };
    },
};
