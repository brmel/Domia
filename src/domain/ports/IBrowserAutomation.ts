import { ResultAsync } from 'neverthrow';
import { NavigationError, InteractionError, SnapshotError, CaptureError } from '../errors';
import { Url, ElementId, DOMSnapshot } from '../value-objects';

/**
 * Browser launch options
 */
export interface LaunchOptions {
    readonly headless: boolean;
    readonly timeout?: number;
}

/**
 * Screenshot data
 */
import { Screenshot } from './Screenshot';

/**
 * IBrowserAutomation Port
 * Abstracts browser automation capabilities
 */
export interface IBrowserAutomation {
    launch(options: LaunchOptions): ResultAsync<void, NavigationError>;
    navigateTo(url: Url): ResultAsync<void, NavigationError>;
    click(elementId: ElementId, options?: { force?: boolean; timeout?: number }): ResultAsync<void, InteractionError>;
    type(elementId: ElementId, text: string): ResultAsync<void, InteractionError>;
    pressKey(key: string): ResultAsync<void, InteractionError>;
    scroll(direction: 'up' | 'down'): ResultAsync<void, InteractionError>;
    wait(durationMs: number): ResultAsync<void, InteractionError>;
    extractText(elementId: ElementId): ResultAsync<string, InteractionError>;
    /**
     * Highlights an element on the page for visual feedback.
     * @param elementId The internal ID of the element to highlight
     */
    highlight(elementId: ElementId): ResultAsync<void, InteractionError>;
    snapshot(): ResultAsync<DOMSnapshot, SnapshotError>;
    /**
     * Captures the full accessibility tree of the page.
     */
    snapshotAria(): ResultAsync<import('../value-objects/AriaNode').AriaNode, SnapshotError>;
    /**
     * Takes a screenshot of the current page.
     */
    screenshot(): ResultAsync<Screenshot, CaptureError>;
    getViewportSize(): Promise<{ width: number; height: number }>;
    waitForDOMStable(timeout?: number): Promise<void>;
    close(): Promise<void>;
}
