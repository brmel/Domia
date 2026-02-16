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

export interface SkillInvocationTelemetry {
    runId: string;
    skillId: string;
    source: 'preferred' | 'auto';
    status: 'started' | 'completed' | 'failed';
    summary: string;
    injectedPlanItems?: number;
}