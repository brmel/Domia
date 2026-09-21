export interface Signal {
  readonly kind: 'budget' | 'duration' | 'plan_stale' | 'context_pressure' | 'idle' | 'policy' | 'node_busy' | 'not_ready' | 'transient';
  readonly message: string;
  readonly data?: Record<string, unknown>;
}
