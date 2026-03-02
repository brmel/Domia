import { ResultAsync } from 'neverthrow';
import { NavigationError, InteractionError } from '../errors';
import type { Url } from '../value-objects';
import type { RoleRefMap } from '../value-objects/RoleRef';
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

    getPerceptionSource(): IPerceptionSource | null;
}

export interface IStructuredAutomation extends IAppAutomation {
    updateRefs(refs: RoleRefMap): void;
    click(ref: string, options?: { force?: boolean; timeout?: number }): ResultAsync<void, InteractionError>;
    type(ref: string, text: string): ResultAsync<void, InteractionError>;
    hover(ref: string): ResultAsync<void, InteractionError>;
    selectOption(ref: string, values: string[]): ResultAsync<void, InteractionError>;
    dragTo(fromRef: string, toRef: string): ResultAsync<void, InteractionError>;
    extractText(ref: string): ResultAsync<string, InteractionError>;
    highlight(ref: string): ResultAsync<void, InteractionError>;
}
