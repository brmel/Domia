export interface EvaluationVerdict {
    readonly satisfied: boolean;
    readonly reason: string;
}

/**
 * Goal-satisfaction evaluator (W10). Judges whether a completed run's result
 * actually satisfies the original goal — a reflection pass distinct from the
 * banned loop-guard (it asks "is the goal met?", not "is the agent looping?").
 * Impl is LLM-backed; failures must degrade to `satisfied: true` so evaluation
 * never blocks a legitimate finish.
 */
export interface IEvaluator {
    evaluate(goal: string, resultSummary: string): Promise<EvaluationVerdict>;
}
