export interface EvaluationVerdict {
    readonly satisfied: boolean;
    readonly reason: string;
}

/** Judges whether a completed run satisfied its goal. Impls must degrade to satisfied:true on failure so evaluation never blocks a finish. */
export interface IEvaluator {
    evaluate(goal: string, resultSummary: string): Promise<EvaluationVerdict>;
}
