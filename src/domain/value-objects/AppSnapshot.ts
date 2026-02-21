import { DOMSnapshot } from './DOMSnapshot';

export interface AppSnapshot extends DOMSnapshot {
    readonly windowId?: string;
    readonly platform: 'web' | 'electron' | 'mobile';
}
