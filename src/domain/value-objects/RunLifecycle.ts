export type RunLifecycleState =
    | 'initialized'
    | 'executing'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'cancelled';

export type RunCheckpointReason =
    | 'run_initialized'
    | 'plan_ready'
    | 'action_applied'
    | 'pause_requested'
    | 'resume_requested'
    | 'terminal_success'
    | 'terminal_failure'
    | 'terminal_cancelled';

const RUN_LIFECYCLE_TRANSITIONS: Readonly<Record<RunLifecycleState, readonly RunLifecycleState[]>> = {
    initialized: ['executing', 'failed', 'cancelled'],
    executing: ['paused', 'completed', 'failed', 'cancelled'],
    paused: ['executing', 'failed', 'cancelled'],
    completed: [],
    failed: [],
    cancelled: []
} as const;

export function canTransitionRunLifecycle(
    from: RunLifecycleState,
    to: RunLifecycleState
): boolean {
    return RUN_LIFECYCLE_TRANSITIONS[from].includes(to);
}
