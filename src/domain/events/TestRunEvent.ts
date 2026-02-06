import type { TestRunId } from '../value-objects';
import type { AgentAction } from '../value-objects';
import type { TestStep } from '../entities';
import type { DomainError } from '../errors';

/**
 * TestRunEvent Discriminated Union
 * Events yielded by RunTestUseCase AsyncGenerator
 */
export type TestRunEvent =
    | StartedEvent
    | ObservingEvent
    | ThinkingEvent
    | ActingEvent
    | StepCompleteEvent
    | ScreenshotEvent
    | ErrorEvent
    | CancelledEvent
    | CompletedEvent;

export interface StartedEvent {
    readonly type: 'started';
    readonly testRunId: TestRunId;
}

export interface ObservingEvent {
    readonly type: 'observing';
}

export interface ThinkingEvent {
    readonly type: 'thinking';
}

export interface ActingEvent {
    readonly type: 'acting';
    readonly action: AgentAction;
}

export interface StepCompleteEvent {
    readonly type: 'step_complete';
    readonly step: TestStep;
}

export interface ScreenshotEvent {
    readonly type: 'screenshot';
    readonly data: Buffer;
}

export interface ErrorEvent {
    readonly type: 'error';
    readonly error: DomainError;
}

export interface CancelledEvent {
    readonly type: 'cancelled';
}

export interface CompletedEvent {
    readonly type: 'completed';
    readonly success: boolean;
    readonly summary: string;
}
