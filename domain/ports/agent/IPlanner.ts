/** Decomposes a goal into ordered sub-goals. Impls must fall back to [goal] on failure so planning never blocks a run. */
export interface IPlanner {
    decompose(goal: string): Promise<readonly string[]>;
}
