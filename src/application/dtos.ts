
import { AgentAction, TestRunId } from '../domain/value-objects';
import { WorkflowError } from '../domain/errors';
import type { PlatformConfig } from '../domain/types/PlatformConfig';
import type {
    RecoveryReplayTelemetry,
    ReplanningTelemetry,
    SkillInvocationTelemetry
} from '../domain/types/RunTelemetry';
import type { RunOptions } from '../shared/validation';

export interface RunTestInput {
    platformConfig: PlatformConfig;
    prompt: string;
    options?: RunOptions;
}

export type {
    RecoveryReplayTelemetry,
    ReplanningTelemetry,
    SkillInvocationTelemetry
};

export type RunTestOutput =
    | { type: 'started'; testRunId: TestRunId }
    | { type: 'observing' }
    | { type: 'thinking' }
    | {
        type: 'evaluating';
        actionType: AgentAction['type'];
        decision: 'sub_task_success' | 'need_retry' | 'need_reformulate';
        summary: string;
        confidence: number;
        evidence: readonly string[];
        advice?: string;
        executionOutcome: 'executed' | 'execution_error' | 'not_executed';
        executionError?: string;
        executionObservation?: string;
    }
    | { type: 'acting'; action: AgentAction }
    | { type: 'state_updated'; state: import('../domain/value-objects').WorkflowState }
    | { type: 'recovery_replay'; telemetry: RecoveryReplayTelemetry }
    | { type: 'replanning'; telemetry: ReplanningTelemetry }
    | { type: 'skill_invocation'; telemetry: SkillInvocationTelemetry }
    | { type: 'completed'; success: boolean; summary?: string }
    | { type: 'error'; error: WorkflowError | Error };
