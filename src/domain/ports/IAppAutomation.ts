import { ResultAsync } from 'neverthrow';
import { NavigationError, InteractionError } from '../errors';
import { Url, ElementId } from '../value-objects';

export interface LaunchOptions {
    readonly headless: boolean;
    readonly timeout?: number;
}

export interface IAppAutomation {
    launch(options: LaunchOptions): ResultAsync<void, NavigationError>;
    navigateTo(url: Url): ResultAsync<void, NavigationError>;
    click(elementId: ElementId, options?: { force?: boolean; timeout?: number }): ResultAsync<void, InteractionError>;
    mouseMove(x: number, y: number): ResultAsync<void, InteractionError>;
    mouseClick(x: number, y: number, button: 'left' | 'right'): ResultAsync<void, InteractionError>;
    mouseDoubleClick(x: number, y: number): ResultAsync<void, InteractionError>;
    mouseDrag(fromX: number, fromY: number, toX: number, toY: number, steps?: number): ResultAsync<void, InteractionError>;
    type(elementId: ElementId, text: string): ResultAsync<void, InteractionError>;
    pressKey(key: string): ResultAsync<void, InteractionError>;
    scroll(direction: 'up' | 'down'): ResultAsync<void, InteractionError>;
    mouseScroll(deltaX: number, deltaY: number): ResultAsync<void, InteractionError>;
    wait(durationMs: number): ResultAsync<void, InteractionError>;
    extractText(elementId: ElementId): ResultAsync<string, InteractionError>;
    highlight(elementId: ElementId): ResultAsync<void, InteractionError>;

    getViewportSize(): Promise<{ width: number; height: number }>;
    waitForDOMStable(timeout?: number): Promise<void>;
    close(): Promise<void>;
}
