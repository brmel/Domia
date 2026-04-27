export const CheckpointReason = {
    RunInitialized: 'run_initialized',
    PlanReady: 'plan_ready',
    PauseRequested: 'pause_requested',
    ResumeRequested: 'resume_requested',
    ActionApplied: 'action_applied',
    RunSuspended: 'run_suspended',
    RunResumed: 'run_resumed',
    TerminalSuccess: 'terminal_success',
    TerminalFailure: 'terminal_failure',
    TerminalCancelled: 'terminal_cancelled',
} as const;

export type CheckpointReason = typeof CheckpointReason[keyof typeof CheckpointReason];
