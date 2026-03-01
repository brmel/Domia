import { ResultAsync } from 'neverthrow';
import { NavigationError, InteractionError } from '../errors';
import { Url, ElementId } from '../value-objects';
import type { IPerceptionSource } from './IPerceptionSource';

export interface LaunchOptions {
    readonly headless: boolean;
    readonly timeout?: number;
}

/**
 * Platform-agnostic automation interface.
 * Contains only operations that make sense for ANY app type (web, Electron, mobile, native).
 */
export interface IAppAutomation {
    launch(options: LaunchOptions): ResultAsync<void, NavigationError>;
    navigateTo(url: Url): ResultAsync<void, NavigationError>;
    mouseMove(x: number, y: number): ResultAsync<void, InteractionError>;
    mouseClick(x: number, y: number, button: 'left' | 'right'): ResultAsync<void, InteractionError>;
    mouseDoubleClick(x: number, y: number): ResultAsync<void, InteractionError>;
    mouseDrag(fromX: number, fromY: number, toX: number, toY: number, steps?: number): ResultAsync<void, InteractionError>;
    pressKey(key: string): ResultAsync<void, InteractionError>;
    scroll(direction: 'up' | 'down'): ResultAsync<void, InteractionError>;
    mouseScroll(deltaX: number, deltaY: number): ResultAsync<void, InteractionError>;
    wait(durationMs: number): ResultAsync<void, InteractionError>;

    getViewportSize(): Promise<{ width: number; height: number }>;
    waitForReady(timeout?: number): Promise<void>;
    close(): Promise<void>;

    /** Return a perception source for capturing page state, or null if unavailable. */
    getPerceptionSource(): IPerceptionSource | null;
}

/**
 * Extended automation for platforms with a structured element tree (DOM, accessibility tree, etc.).
 * Adds element-targeted interactions that require an element identifier from a snapshot.
 */
export interface IStructuredAutomation extends IAppAutomation {
    click(elementId: ElementId, options?: { force?: boolean; timeout?: number }): ResultAsync<void, InteractionError>;
    type(elementId: ElementId, text: string): ResultAsync<void, InteractionError>;
    extractText(elementId: ElementId): ResultAsync<string, InteractionError>;
    highlight(elementId: ElementId): ResultAsync<void, InteractionError>;
}
