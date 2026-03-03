export interface ReplanningTelemetry {
    runId: string;
    trigger?: 'loop_detected' | 'action_execution_error' | 'assertion_fail' | 'max_actions_reached';
    status: 'executed' | 'suppressed';
    reason: string;
    mode: 'active';
    replanCount: number;
    maxReplansPerRun: number;
}