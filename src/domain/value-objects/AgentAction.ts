import { ActionType } from '../enums';

export type AgentAction =
    | ClickAction
    | TypeAction
    | HoverAction
    | SelectOptionAction
    | DragToAction
    | ScrollAction
    | MouseMoveAction
    | MouseClickLeftAction
    | MouseClickRightAction
    | MouseDoubleClickAction
    | MouseDragAction
    | MouseScrollAction
    | WaitAction
    | WaitForConditionAction
    | PressKeyAction
    | ExtractAction
    | NavigateAction
    | ObserveAction
    | StartRecordingAction
    | StopAndReviewRecordingAction
    | PassAction
    | FailAction
    | ShellExecAction
    | ListWindowsAction
    | SwitchWindowAction
    | OpenTabAction
    | ListBrowserTabsAction
    | SwitchBrowserTabAction
    | CloseBrowserTabAction;

interface ClickAction {
    readonly type: ActionType.CLICK;
    readonly ref: string;
    readonly elementDescriptor?: string;
    readonly thought: string;
}

interface TypeAction {
    readonly type: ActionType.TYPE;
    readonly ref: string;
    readonly elementDescriptor?: string;
    readonly text: string;
    readonly submit?: boolean;
    readonly thought: string;
}

interface HoverAction {
    readonly type: ActionType.HOVER;
    readonly ref: string;
    readonly thought: string;
}

interface SelectOptionAction {
    readonly type: ActionType.SELECT_OPTION;
    readonly ref: string;
    readonly values: string[];
    readonly thought: string;
}

interface DragToAction {
    readonly type: ActionType.DRAG_TO;
    readonly fromRef: string;
    readonly toRef: string;
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

interface WaitForConditionAction {
    readonly type: ActionType.WAIT_FOR_CONDITION;
    readonly pattern: string;
    readonly isRegex?: boolean;
    readonly timeoutMs?: number;
    readonly pollIntervalMs?: number;
    readonly thought: string;
}

interface PressKeyAction {
    readonly type: ActionType.PRESS_KEY;
    readonly key: string;
    readonly thought: string;
}

interface ExtractAction {
    readonly type: ActionType.EXTRACT;
    readonly ref: string;
    readonly elementDescriptor?: string;
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

interface StartRecordingAction {
    readonly type: ActionType.START_RECORDING;
    readonly thought: string;
}

interface StopAndReviewRecordingAction {
    readonly type: ActionType.STOP_AND_REVIEW_RECORDING;
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

interface ShellExecAction {
    readonly type: ActionType.SHELL_EXEC;
    readonly command: string;
    readonly cwd?: string;
    readonly timeoutMs?: number;
    readonly thought: string;
}

interface ListWindowsAction {
    readonly type: ActionType.LIST_WINDOWS;
    readonly thought: string;
}

interface SwitchWindowAction {
    readonly type: ActionType.SWITCH_WINDOW;
    readonly windowId: string;
    readonly thought: string;
}

interface OpenTabAction {
    readonly type: ActionType.OPEN_TAB;
    readonly url?: string;
    readonly thought: string;
}

interface ListBrowserTabsAction {
    readonly type: ActionType.LIST_BROWSER_TABS;
    readonly thought: string;
}

interface SwitchBrowserTabAction {
    readonly type: ActionType.SWITCH_BROWSER_TAB;
    readonly index: number;
    readonly thought: string;
}

interface CloseBrowserTabAction {
    readonly type: ActionType.CLOSE_BROWSER_TAB;
    readonly index?: number;
    readonly thought: string;
}
