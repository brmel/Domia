import { injectable } from 'tsyringe';
import type { AgentAction, LLMEvaluationDecision } from '@domain/value-objects';

export interface VerificationPolicyContext {
    readonly attemptedAction: AgentAction;
    readonly executionOutcome: 'executed' | 'execution_error' | 'not_executed';
    readonly stepsRemaining: number;
}

export interface VerificationPolicyDecision {
    readonly evaluation: LLMEvaluationDecision;
    readonly adjusted: boolean;
    readonly reason: string;
}

@injectable()
export class VerificationPolicyService {
    private readonly minConfidenceByDecision: Readonly<Record<LLMEvaluationDecision['decision'], number>> = {
        sub_task_success: 0.8,
        need_retry: 0.4,
        need_reformulate: 0.6
    };

    enforce(evaluation: LLMEvaluationDecision, context: VerificationPolicyContext): VerificationPolicyDecision {
        this.assertEvidenceShape(evaluation);

        const threshold = this.minConfidenceByDecision[evaluation.decision];
        if (evaluation.confidence >= threshold) {
            return {
                evaluation,
                adjusted: false,
                reason: 'Evaluation accepted by verification policy'
            };
        }

        if (evaluation.decision === 'sub_task_success') {
            return {
                evaluation: {
                    decision: 'need_retry',
                    summary: `Verifier confidence ${evaluation.confidence.toFixed(2)} below success threshold ${threshold.toFixed(2)}.`,
                    advice: 'Collect an additional visible confirmation before declaring success.',
                    confidence: Math.max(evaluation.confidence, 0.5),
                    evidence: [...evaluation.evidence, 'Policy downgraded success to retry due to low confidence.']
                },
                adjusted: true,
                reason: 'Low-confidence success downgraded to retry'
            };
        }

        if (evaluation.decision === 'need_reformulate') {
            return {
                evaluation: {
                    decision: 'need_retry',
                    summary: `Reformulation confidence ${evaluation.confidence.toFixed(2)} below threshold ${threshold.toFixed(2)}.`,
                    advice: evaluation.advice ?? 'Retry once with a narrower interaction strategy before reformulating.',
                    confidence: Math.max(evaluation.confidence, 0.5),
                    evidence: [...evaluation.evidence, 'Policy requested one retry before reformulation due to low confidence.']
                },
                adjusted: true,
                reason: 'Low-confidence reformulation converted to retry'
            };
        }

        if (context.executionOutcome === 'execution_error') {
            return {
                evaluation: {
                    ...evaluation,
                    confidence: Math.max(evaluation.confidence, 0.5),
                    evidence: [...evaluation.evidence, 'Execution error observed; retry retained by policy.']
                },
                adjusted: true,
                reason: 'Retry retained with normalized confidence after execution error'
            };
        }

        return {
            evaluation,
            adjusted: false,
            reason: 'Retry accepted despite low confidence due to policy floor'
        };
    }

    private assertEvidenceShape(evaluation: LLMEvaluationDecision): void {
        if (!Number.isFinite(evaluation.confidence) || evaluation.confidence < 0 || evaluation.confidence > 1) {
            throw new Error(`Invalid evaluation confidence: ${evaluation.confidence}`);
        }

        if (!Array.isArray(evaluation.evidence) || evaluation.evidence.length === 0) {
            throw new Error('Evaluation evidence must contain at least one item');
        }
    }
}
