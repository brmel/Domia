import type { ElementId } from './Brand';
import { AgentActionType } from '../enums/AgentActionType';

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
    | AskUserAction
    | PassAction
    | FailAction;

export interface ClickAction {
    readonly type: AgentActionType.CLICK;
    readonly elementId: ElementId;
    readonly thought: string;
}

export interface TypeAction {
    readonly type: AgentActionType.TYPE;
    readonly elementId: ElementId;
    readonly text: string;
    readonly submit?: boolean;
    readonly thought: string;
}

export interface ScrollAction {
    readonly type: AgentActionType.SCROLL;
    readonly direction: 'up' | 'down';
    readonly thought: string;
}

export interface WaitAction {
    readonly type: AgentActionType.WAIT;
    readonly durationMs: number;
    readonly thought: string;
}

export interface PressKeyAction {
    readonly type: AgentActionType.PRESS_KEY;
    readonly key: string;
    readonly thought: string;
}

export interface ExtractAction {
    readonly type: AgentActionType.EXTRACT;
    readonly elementId: ElementId;
    readonly thought: string;
}

export interface NavigateAction {
    readonly type: AgentActionType.NAVIGATE;
    readonly url: string;
    readonly thought: string;
}

export interface AskUserAction {
    readonly type: AgentActionType.ASK_USER;
    readonly question: string;
    readonly thought: string;
}

export interface PassAction {
    readonly type: AgentActionType.PASS;
    readonly summary: string;
    readonly thought?: string;
}

export interface FailAction {
    readonly type: AgentActionType.FAIL;
    readonly reason: string;
    readonly thought?: string;
}

/**
 * Type guard for terminal actions
 */
export function isTerminalAction(action: AgentAction): action is PassAction | FailAction {
    return action.type === AgentActionType.PASS || action.type === AgentActionType.FAIL;
}

