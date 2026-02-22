import type { TestRunId } from '../value-objects';
import type { AgentAction } from '../value-objects';
import type { WorkflowState } from '../value-objects';
import type { DomainError } from '../errors';
import type { RecoveryReplayTelemetry, ReplanningTelemetry } from '../types/RunTelemetry';

/**
 * TestRunEvent Discriminated Union
 * Events yielded by RunTestUseCase AsyncGenerator
 */
export type TestRunEvent =
    | StartedEvent
    | ThinkingEvent
    | ActingEvent
    | StateUpdatedEvent
    | ScreenshotEvent
    | ErrorEvent
    | CancelledEvent
    | ResumedEvent
    | PausedEvent
    | CompletedEvent
    | PlanningEvent
    | RecoveryReplayEvent
    | ReplanningEvent;

export interface PlanningEvent {
    readonly type: 'planning';
}

export interface StartedEvent {
    readonly type: 'started';
    readonly testRunId: TestRunId;
}

export interface PausedEvent {
    readonly type: 'paused';
}

export interface ResumedEvent {
    readonly type: 'resumed';
}

export interface ThinkingEvent {
    readonly type: 'thinking';
}

export interface ActingEvent {
    readonly type: 'acting';
    readonly action: AgentAction;
}

export interface StateUpdatedEvent {
    readonly type: 'state_updated';
    readonly state: WorkflowState;
}

export interface ScreenshotEvent {
    readonly type: 'screenshot';
    readonly data: string; // base64 encoded
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

export interface RecoveryReplayEvent {
    readonly type: 'recovery_replay';
    readonly telemetry: RecoveryReplayTelemetry;
}

export interface ReplanningEvent {
    readonly type: 'replanning';
    readonly telemetry: ReplanningTelemetry;
}
