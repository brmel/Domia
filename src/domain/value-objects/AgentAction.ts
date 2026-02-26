import type { ElementId } from './Brand';
import { ActionType } from '../enums/ActionType';

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
    | ObserveAction
    | PassAction
    | FailAction;

interface ClickAction {
    readonly type: ActionType.CLICK;
    readonly elementId: ElementId;
    readonly elementDescriptor?: string | undefined;
    readonly thought: string;
}

interface TypeAction {
    readonly type: ActionType.TYPE;
    readonly elementId: ElementId;
    readonly elementDescriptor?: string | undefined;
    readonly text: string;
    readonly submit?: boolean;
    readonly thought: string;
}

interface ScrollAction {
    readonly type: ActionType.SCROLL;
    readonly direction: 'up' | 'down';
    readonly thought: string;
}

interface MouseMoveAction {
    readonly type: ActionType.MOUSE_MOVE;
    readonly x: number;
    readonly y: number;
    readonly thought: string;
}

interface MouseClickLeftAction {
    readonly type: ActionType.MOUSE_CLICK_LEFT;
    readonly x: number;
    readonly y: number;
    readonly thought: string;
}

interface MouseClickRightAction {
    readonly type: ActionType.MOUSE_CLICK_RIGHT;
    readonly x: number;
    readonly y: number;
    readonly thought: string;
}

interface MouseDoubleClickAction {
    readonly type: ActionType.MOUSE_DOUBLE_CLICK;
    readonly x: number;
    readonly y: number;
    readonly thought: string;
}

interface MouseDragAction {
    readonly type: ActionType.MOUSE_DRAG;
    readonly fromX: number;
    readonly fromY: number;
    readonly toX: number;
    readonly toY: number;
    readonly steps?: number;
    readonly thought: string;
}

interface MouseScrollAction {
    readonly type: ActionType.MOUSE_SCROLL;
    readonly deltaX: number;
    readonly deltaY: number;
    readonly thought: string;
}

interface WaitAction {
    readonly type: ActionType.WAIT;
    readonly durationMs: number;
    readonly thought: string;
}

interface PressKeyAction {
    readonly type: ActionType.PRESS_KEY;
    readonly key: string;
    readonly thought: string;
}

interface ExtractAction {
    readonly type: ActionType.EXTRACT;
    readonly elementId: ElementId;
    readonly elementDescriptor?: string | undefined;
    readonly thought: string;
}

interface NavigateAction {
    readonly type: ActionType.NAVIGATE;
    readonly url: string;
    readonly thought: string;
}

interface ObserveAction {
    readonly type: ActionType.OBSERVE;
    readonly delayMs?: number;
    readonly vision?: boolean;
    readonly thought: string;
}

interface PassAction {
    readonly type: ActionType.PASS;
    readonly summary: string;
    readonly thought?: string;
}

interface FailAction {
    readonly type: ActionType.FAIL;
    readonly reason: string;
    readonly thought?: string;
}


