import type { ElementId } from './Brand';
import { ActionType } from '../enums/ActionType';

/**
 * AgentAction Value Object
 * Discriminated union of all possible agent actions
 */
export type AgentAction =
    | ClickAction
    | TypeAction
    | ScrollAction
    | MouseMoveAction
    | MouseClickLeftAction
    | MouseClickRightAction
    | MouseDoubleClickAction
    | MouseDragAction
    | MouseScrollAction
    | WaitAction
    | PressKeyAction
    | ExtractAction
    | NavigateAction
    | PassAction
    | FailAction;

export interface ClickAction {
    readonly type: ActionType.CLICK;
    readonly elementId: ElementId;
    readonly elementDescriptor?: string | undefined;
    readonly thought: string;
}

export interface TypeAction {
    readonly type: ActionType.TYPE;
    readonly elementId: ElementId;
    readonly elementDescriptor?: string | undefined;
    readonly text: string;
    readonly submit?: boolean;
    readonly thought: string;
}

export interface ScrollAction {
    readonly type: ActionType.SCROLL;
    readonly direction: 'up' | 'down';
    readonly thought: string;
}

export interface MouseMoveAction {
    readonly type: ActionType.MOUSE_MOVE;
    readonly x: number;
    readonly y: number;
    readonly thought: string;
}

export interface MouseClickLeftAction {
    readonly type: ActionType.MOUSE_CLICK_LEFT;
    readonly x: number;
    readonly y: number;
    readonly thought: string;
}

export interface MouseClickRightAction {
    readonly type: ActionType.MOUSE_CLICK_RIGHT;
    readonly x: number;
    readonly y: number;
    readonly thought: string;
}

export interface MouseDoubleClickAction {
    readonly type: ActionType.MOUSE_DOUBLE_CLICK;
    readonly x: number;
    readonly y: number;
    readonly thought: string;
}

export interface MouseDragAction {
    readonly type: ActionType.MOUSE_DRAG;
    readonly fromX: number;
    readonly fromY: number;
    readonly toX: number;
    readonly toY: number;
    readonly steps?: number;
    readonly thought: string;
}

export interface MouseScrollAction {
    readonly type: ActionType.MOUSE_SCROLL;
    readonly deltaX: number;
    readonly deltaY: number;
    readonly thought: string;
}

export interface WaitAction {
    readonly type: ActionType.WAIT;
    readonly durationMs: number;
    readonly thought: string;
}

export interface PressKeyAction {
    readonly type: ActionType.PRESS_KEY;
    readonly key: string;
    readonly thought: string;
}

export interface ExtractAction {
    readonly type: ActionType.EXTRACT;
    readonly elementId: ElementId;
    readonly elementDescriptor?: string | undefined;
    readonly thought: string;
}

export interface NavigateAction {
    readonly type: ActionType.NAVIGATE;
    readonly url: string;
    readonly thought: string;
}

export interface PassAction {
    readonly type: ActionType.PASS;
    readonly summary: string;
    readonly thought?: string;
}

export interface FailAction {
    readonly type: ActionType.FAIL;
    readonly reason: string;
    readonly thought?: string;
}

/**
 * Type guard for terminal actions
 */
export function isTerminalAction(action: AgentAction): action is PassAction | FailAction {
    return action.type === ActionType.PASS || action.type === ActionType.FAIL;
}
