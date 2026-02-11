import { ResultAsync } from 'neverthrow';
import { NavigationError, InteractionError } from '../errors';
import { Url, ElementId } from '../value-objects';

/**
 * Browser launch options
 */
export interface LaunchOptions {
    readonly headless: boolean;
    readonly timeout?: number;
}


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
    /**
     * Highlights an element on the page for visual feedback.
     * @param elementId The internal ID of the element to highlight
     */
    highlight(elementId: ElementId): ResultAsync<void, InteractionError>;

    getViewportSize(): Promise<{ width: number; height: number }>;
    waitForDOMStable(timeout?: number): Promise<void>;
    close(): Promise<void>;
}
