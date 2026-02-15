
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

export interface ReplanningTelemetry {
    runId: string;
    trigger?: 'loop_detected' | 'action_execution_error' | 'assertion_fail' | 'max_actions_reached';
    status: 'executed' | 'suppressed';
    reason: string;
    mode: 'active';
    replanCount: number;
    maxReplansPerRun: number;
}

export type RunTestOutput =
    | { type: 'started'; testRunId: TestRunId }
    | { type: 'observing' }
    | { type: 'thinking' }
    | {
        type: 'evaluating';
        actionType: AgentAction['type'];
        decision: 'sub_task_success' | 'need_retry' | 'need_reformulate';
        summary: string;
        advice?: string;
        executionOutcome: 'executed' | 'execution_error' | 'not_executed';
        executionError?: string;
    }
    | { type: 'acting'; action: AgentAction }
    | { type: 'state_updated'; state: import('../domain/value-objects').WorkflowState }
    | { type: 'recovery_replay'; telemetry: RecoveryReplayTelemetry }
    | { type: 'replanning'; telemetry: ReplanningTelemetry }
    | { type: 'completed'; success: boolean; summary?: string }
    | { type: 'error'; error: WorkflowError | Error };
