import type { ElementId } from './Brand';

export interface DOMElement {
    readonly id: ElementId;
    readonly tag: string;
    readonly role: string | null;
    readonly text: string;
    readonly attributes: Readonly<Record<string, string>>;
    readonly isInteractive: boolean;
    readonly boundingBox: BoundingBox | null;
}

interface BoundingBox {
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
    readonly screenshot?: string | undefined;
    readonly screenshots?: string[]; // All available screenshots
    readonly timestamp: Date;
}


