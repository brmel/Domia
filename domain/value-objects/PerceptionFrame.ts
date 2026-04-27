import type { RoleRefMap } from './RoleRef';
import { VisualContext } from './VisualContext';

export interface PerceptionFrame {
    readonly id: string;
    readonly timestamp: number;
    readonly captureDurationMs?: number;
    readonly metadata: {
        readonly url: string;
        readonly title: string;
        readonly viewport: { readonly width: number; readonly height: number };
    };
    readonly vision: VisualContext;
    readonly semantic: {
        readonly ariaSnapshot: string;
        readonly refs: RoleRefMap;
    };
}
