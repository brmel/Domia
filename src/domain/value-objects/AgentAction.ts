import type { ElementId } from './Brand';

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
    readonly type: 'click';
    readonly elementId: ElementId;
    readonly thought: string;
}

export interface TypeAction {
    readonly type: 'type';
    readonly elementId: ElementId;
    readonly text: string;
    readonly submit?: boolean;
    readonly thought: string;
}

export interface ScrollAction {
    readonly type: 'scroll';
    readonly direction: 'up' | 'down';
    readonly thought: string;
}

export interface WaitAction {
    readonly type: 'wait';
    readonly durationMs: number;
    readonly thought: string;
}

export interface PressKeyAction {
    readonly type: 'pressKey';
    readonly key: string;
    readonly thought: string;
}

export interface ExtractAction {
    readonly type: 'extract';
    readonly elementId: ElementId;
    readonly thought: string;
}

export interface NavigateAction {
    readonly type: 'navigate';
    readonly url: string;
    readonly thought: string;
}

export interface PassAction {
    readonly type: 'pass';
    readonly summary: string;
    readonly thought?: string;
}

export interface FailAction {
    readonly type: 'fail';
    readonly reason: string;
    readonly thought?: string;
}

/**
 * Type guard for terminal actions
 */
export function isTerminalAction(action: AgentAction): action is PassAction | FailAction {
    return action.type === 'pass' || action.type === 'fail';
}
