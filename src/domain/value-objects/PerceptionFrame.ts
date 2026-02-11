import { DOMSnapshot } from './DOMSnapshot';
import { AriaNode } from './AriaNode';

import { VisualContext } from './VisualContext';

export interface PerceptionFrame {
    id: string; // UUID
    timestamp: number;
    metadata: {
        url: string;
        title: string;
        viewport: { width: number; height: number };
    };
    vision: VisualContext;
    semantic: {
        dom: DOMSnapshot;
        accessibility: AriaNode | null;
    };
    // Future modalities
    network?: unknown[];
    console?: unknown[];
}
