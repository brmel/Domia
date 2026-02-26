import type { RunId } from '../value-objects';
import type { AgentAction } from '../value-objects';
import type { WorkflowState } from '../value-objects';
import type { DomainError } from '../errors';
import type { RecoveryReplayTelemetry, ReplanningTelemetry } from '../types/RunTelemetry';

export type RunEvent =
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

interface PlanningEvent {
    readonly type: 'planning';
}

interface StartedEvent {
    readonly type: 'started';
    readonly runId: RunId;
}

interface PausedEvent {
    readonly type: 'paused';
}

interface ResumedEvent {
    readonly type: 'resumed';
}

interface ThinkingEvent {
    readonly type: 'thinking';
}

interface ActingEvent {
    readonly type: 'acting';
    readonly action: AgentAction;
}

interface StateUpdatedEvent {
    readonly type: 'state_updated';
    readonly state: WorkflowState;
}

interface ScreenshotEvent {
    readonly type: 'screenshot';
    readonly data: string; // base64 encoded
}

interface ErrorEvent {
    readonly type: 'error';
    readonly error: DomainError;
}

interface CancelledEvent {
    readonly type: 'cancelled';
}

interface CompletedEvent {
    readonly type: 'completed';
    readonly success: boolean;
    readonly summary: string;
}

interface RecoveryReplayEvent {
    readonly type: 'recovery_replay';
    readonly telemetry: RecoveryReplayTelemetry;
}

interface ReplanningEvent {
    readonly type: 'replanning';
    readonly telemetry: ReplanningTelemetry;
}
