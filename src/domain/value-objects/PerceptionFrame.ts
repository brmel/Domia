import { DOMSnapshot } from './DOMSnapshot';
import { AriaNode } from './AriaNode';

export interface PerceptionFrame {
    id: string; // UUID
    timestamp: number;
    metadata: {
        url: string;
        title: string;
        viewport: { width: number; height: number };
    };
    vision: {
        screenshot: Buffer; // Raw buffer for processing, to be saved to disk
        mimeType: string;
    };
    semantic: {
        dom: DOMSnapshot;
        accessibility: AriaNode | null;
    };
    // Future modalities
    network?: unknown[];
    console?: unknown[];
}
