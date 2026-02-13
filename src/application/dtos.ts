
import { AgentAction, TestRunId } from '../domain/value-objects';
import { WorkflowError } from '../domain/errors';
import type { PlatformConfig } from '../domain/types/PlatformConfig';
import type { RunOptions } from '../shared/validation';

export interface RunTestInput {
    platformConfig: PlatformConfig;
    prompt: string;
    options?: RunOptions;
}

export interface RecoveryReplayTelemetry {
    sourceRunId: string;
    targetStepNumber: number;
    replayedCount: number;
    status: 'started' | 'completed' | 'cancelled' | 'blocked' | 'failed';
    reason?: string;
}

export type RunTestOutput =
    | { type: 'started'; testRunId: TestRunId }
    | { type: 'observing' }
    | { type: 'thinking' }
    | { type: 'acting'; action: AgentAction }
    | { type: 'state_updated'; state: import('../domain/value-objects').WorkflowState }
    | { type: 'recovery_replay'; telemetry: RecoveryReplayTelemetry }
    | { type: 'completed'; success: boolean; summary?: string }
    | { type: 'error'; error: WorkflowError | Error };
