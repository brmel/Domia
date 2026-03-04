
import { AgentAction, RunId } from '@domain/value-objects';
import { WorkflowError } from '@domain/errors';
import type { PlatformConfig } from '@domain/types/PlatformConfig';
import type {
    ReplanningTelemetry
} from '@domain/types/RunTelemetry';
import type { RunOptions } from '@shared/validation';

export interface RunInput {
    platformConfig: PlatformConfig;
    prompt: string;
    options?: RunOptions;
}

export type {
    ReplanningTelemetry
};

export type RunOutput =
    | { type: 'started'; runId: RunId }
    | { type: 'thinking_chunk'; text: string }
    | { type: 'acting'; action: AgentAction }
    | { type: 'state_updated'; state: import('@domain/value-objects').WorkflowState }
    | { type: 'replanning'; telemetry: ReplanningTelemetry }
    | { type: 'completed'; success: boolean; summary?: string }
    | { type: 'error'; error: WorkflowError | Error };
