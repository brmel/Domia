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
