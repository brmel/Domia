/**
 * Goal decomposition planner (W9). Splits a high-level goal into an ordered list
 * of concrete sub-goal descriptions the run loop executes in sequence. Impl is
 * LLM-backed; on any failure it must fall back to a single item (the original
 * goal) so planning never blocks a run.
 */
export interface IPlanner {
    decompose(goal: string): Promise<readonly string[]>;
}
