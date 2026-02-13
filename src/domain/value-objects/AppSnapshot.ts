
import { DOMSnapshot } from './DOMSnapshot';

/**
 * AppSnapshot
 * Represents the state of an application at a point in time.
 * For Web/Electron, this includes the DOM of the active window(s).
 */
export interface AppSnapshot extends DOMSnapshot {
    /**
     * Unique identifier for the window this snapshot belongs to.
     * Essential for multi-window Electron apps.
     */
    readonly windowId?: string;

    /**
     * Platform where this snapshot was taken.
     */
    readonly platform: 'web' | 'electron' | 'mobile';
}
