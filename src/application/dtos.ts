
import { AgentAction, TestRunId } from '../domain/value-objects';
import { WorkflowError } from '../domain/errors';
import type { PlatformConfig } from '../domain/types/PlatformConfig';
import type {
    RecoveryReplayTelemetry,
    ReplanningTelemetry
} from '../domain/types/RunTelemetry';
import type { RunOptions } from '../shared/validation';

export interface RunTestInput {
    platformConfig: PlatformConfig;
    prompt: string;
    options?: RunOptions;
}

export type {
    RecoveryReplayTelemetry,
    ReplanningTelemetry
};

export type RunTestOutput =
    | { type: 'started'; testRunId: TestRunId }
    | { type: 'thinking' }
    | { type: 'acting'; action: AgentAction }
    | { type: 'state_updated'; state: import('../domain/value-objects').WorkflowState }
    | { type: 'recovery_replay'; telemetry: RecoveryReplayTelemetry }
    | { type: 'replanning'; telemetry: ReplanningTelemetry }
    | { type: 'completed'; success: boolean; summary?: string }
    | { type: 'error'; error: WorkflowError | Error };
