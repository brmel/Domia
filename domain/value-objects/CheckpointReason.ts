export const CheckpointReason = {
    RunInitialized: 'run_initialized',
    PlanReady: 'plan_ready',
    PauseRequested: 'pause_requested',
    ResumeRequested: 'resume_requested',
    ActionApplied: 'action_applied',
    TerminalSuccess: 'terminal_success',
    TerminalFailure: 'terminal_failure',
    TerminalCancelled: 'terminal_cancelled',
} as const;

export type CheckpointReason = typeof CheckpointReason[keyof typeof CheckpointReason];
