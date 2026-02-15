export type EvaluationDecisionType = 'sub_task_success' | 'need_retry' | 'need_reformulate';

export interface LLMEvaluationDecision {
    readonly decision: EvaluationDecisionType;
    readonly summary: string;
    readonly advice?: string;
}
