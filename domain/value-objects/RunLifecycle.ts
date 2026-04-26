export type RunCheckpointReason =
    | 'run_initialized'
    | 'plan_ready'
    | 'action_applied'
    | 'pause_requested'
    | 'resume_requested'
    | 'terminal_success'
    | 'terminal_failure'
    | 'terminal_cancelled';
