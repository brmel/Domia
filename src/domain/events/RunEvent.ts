import type { RunId } from '../value-objects';
import type { AgentAction } from '../value-objects';
import type { WorkflowState } from '../value-objects';
import type { DomainError } from '../errors';
import type { ReplanningTelemetry } from '../types/RunTelemetry';

export type RunEvent =
    | StartedEvent
    | ThinkingChunkEvent
    | ActingEvent
    | StateUpdatedEvent
    | ErrorEvent
    | CompletedEvent
    | CancelledEvent
    | ReplanningEvent;

interface ThinkingChunkEvent {
    readonly type: 'thinking_chunk';
    readonly text: string;
}

interface StartedEvent {
    readonly type: 'started';
    readonly runId: RunId;
}

interface ActingEvent {
    readonly type: 'acting';
    readonly action: AgentAction;
}

interface StateUpdatedEvent {
    readonly type: 'state_updated';
    readonly state: WorkflowState;
}

interface ErrorEvent {
    readonly type: 'error';
    readonly error: DomainError;
}

interface CompletedEvent {
    readonly type: 'completed';
    readonly success: boolean;
    readonly summary: string;
}

interface CancelledEvent {
    readonly type: 'cancelled';
    readonly summary?: string;
}

interface ReplanningEvent {
    readonly type: 'replanning';
    readonly telemetry: ReplanningTelemetry;
}
