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
export interface Screenshot {
    readonly data: Buffer;
    readonly timestamp: Date;
}

/**
 * IBrowserAutomation Port
 * Abstracts browser automation capabilities
 */
export interface IBrowserAutomation {
    launch(options: LaunchOptions): ResultAsync<void, NavigationError>;
    navigateTo(url: Url): ResultAsync<void, NavigationError>;
    click(elementId: ElementId): ResultAsync<void, InteractionError>;
    type(elementId: ElementId, text: string): ResultAsync<void, InteractionError>;
    pressKey(key: string): ResultAsync<void, InteractionError>;
    scroll(direction: 'up' | 'down'): ResultAsync<void, InteractionError>;
    wait(durationMs: number): ResultAsync<void, InteractionError>;
    extractText(elementId: ElementId): ResultAsync<string, InteractionError>;
    snapshot(): ResultAsync<DOMSnapshot, SnapshotError>;
    screenshot(): ResultAsync<Screenshot, CaptureError>;
    getViewportSize(): Promise<{ width: number; height: number }>;
    waitForDOMStable(timeout?: number): Promise<void>;
    close(): Promise<void>;
}
