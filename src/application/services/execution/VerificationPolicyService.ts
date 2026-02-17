import { injectable } from 'tsyringe';
import type { AgentAction, LLMEvaluationDecision } from '@domain/value-objects';
import { ActionType } from '@domain/enums/ActionType';
import type { VerificationPolicyProfile } from './coordinators/StepExecutionCoordinator';

export interface VerificationPolicyContext {
    readonly attemptedAction: AgentAction;
    readonly executionOutcome: 'executed' | 'execution_error' | 'not_executed';
    readonly stepsRemaining: number;
    readonly priorActionCount?: number;
}

export interface VerificationPolicyDecision {
    readonly evaluation: LLMEvaluationDecision;
    readonly adjusted: boolean;
    readonly reason: string;
}

type PolicyRule = (
    evaluation: LLMEvaluationDecision,
    context: VerificationPolicyContext,
    profile: VerificationPolicyProfile
) => VerificationPolicyDecision | null;

@injectable()
export class VerificationPolicyService {
    private readonly defaultProfile: VerificationPolicyProfile = {
        enforceSupervisedTerminalPass: true,
        terminalPassMinConfidence: 0.9,
        terminalPassMinEvidenceItems: 2,
    };

    private readonly minConfidenceByDecision: Readonly<Record<LLMEvaluationDecision['decision'], number>> = {
        sub_task_success: 0.8,
        need_retry: 0.4,
        need_reformulate: 0.6
    };

    enforce(
        evaluation: LLMEvaluationDecision,
        context: VerificationPolicyContext,
        profileOverrides?: Partial<VerificationPolicyProfile>
    ): VerificationPolicyDecision {
        this.assertEvidenceShape(evaluation);
        const profile = this.resolveProfile(profileOverrides);

        for (const rule of this.getOrderedRules()) {
            const decision = rule(evaluation, context, profile);
            if (decision) {
                return decision;
            }
        }

        return this.accept(evaluation, 'Evaluation accepted by verification policy');
    }

    private getOrderedRules(): readonly PolicyRule[] {
        return [
            this.applyTerminalPassContract.bind(this),
            this.applyExplicitPassRequirementRule.bind(this),
            this.applyLowConfidenceRule.bind(this),
            this.applyExecutionErrorRetryRule.bind(this)
        ];
    }

    private applyExplicitPassRequirementRule(
        evaluation: LLMEvaluationDecision,
        context: VerificationPolicyContext,
        profile: VerificationPolicyProfile
    ): VerificationPolicyDecision | null {
        if (
            !profile.enforceSupervisedTerminalPass
            || evaluation.decision !== 'sub_task_success'
            || context.attemptedAction.type === ActionType.PASS
        ) {
            return null;
        }

        return {
            evaluation: {
                decision: 'need_retry',
                summary: 'Supervised mode requires an explicit pass action before terminal success.',
                advice: 'If goal is satisfied, issue a PASS action with concise evidence summary.',
                confidence: this.normalizeRetryConfidence(evaluation.confidence),
                evidence: [
                    ...evaluation.evidence,
                    'Policy requires explicit terminal PASS in supervised mode.'
                ]
            },
            adjusted: true,
            reason: 'Sub-task success converted to retry until explicit pass action is issued'
        };
    }

    private applyLowConfidenceRule(
        evaluation: LLMEvaluationDecision,
        context: VerificationPolicyContext,
        _profile: VerificationPolicyProfile
    ): VerificationPolicyDecision | null {
        const threshold = this.minConfidenceByDecision[evaluation.decision];
        if (evaluation.confidence >= threshold) {
            if (evaluation.decision === 'need_retry' && context.executionOutcome !== 'execution_error') {
                return {
                    evaluation,
                    adjusted: false,
                    reason: 'Retry accepted by verification policy'
                };
            }

            return null;
        }

        if (evaluation.decision === 'sub_task_success') {
            return {
                evaluation: {
                    decision: 'need_retry',
                    summary: `Verifier confidence ${evaluation.confidence.toFixed(2)} below success threshold ${threshold.toFixed(2)}.`,
                    advice: 'Collect an additional visible confirmation before declaring success.',
                    confidence: this.normalizeRetryConfidence(evaluation.confidence, 0.5),
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
                    confidence: this.normalizeRetryConfidence(evaluation.confidence, 0.5),
                    evidence: [...evaluation.evidence, 'Policy requested one retry before reformulation due to low confidence.']
                },
                adjusted: true,
                reason: 'Low-confidence reformulation converted to retry'
            };
        }

        return {
            evaluation,
            adjusted: false,
            reason: 'Retry accepted despite low confidence due to policy floor'
        };
    }

    private applyExecutionErrorRetryRule(
        evaluation: LLMEvaluationDecision,
        context: VerificationPolicyContext,
        _profile: VerificationPolicyProfile
    ): VerificationPolicyDecision | null {
        if (context.executionOutcome !== 'execution_error') {
            return null;
        }

        return {
            evaluation: {
                ...evaluation,
                confidence: this.normalizeRetryConfidence(evaluation.confidence, 0.5),
                evidence: [...evaluation.evidence, 'Execution error observed; retry retained by policy.']
            },
            adjusted: true,
            reason: 'Retry retained with normalized confidence after execution error'
        };
    }

    private applyTerminalPassContract(
        evaluation: LLMEvaluationDecision,
        context: VerificationPolicyContext,
        profile: VerificationPolicyProfile
    ): VerificationPolicyDecision | null {
        if (context.attemptedAction.type !== ActionType.PASS || evaluation.decision !== 'sub_task_success') {
            return null;
        }

        const priorActionCount = context.priorActionCount ?? 0;

        if (priorActionCount === 0) {
            return {
                evaluation: {
                    decision: 'need_retry',
                    summary: 'Terminal pass rejected: no prior verification action was executed in this step.',
                    advice: 'Perform at least one concrete verification action before passing (for example extract, click+observe, or wait+re-check).',
                    confidence: this.normalizeRetryConfidence(evaluation.confidence),
                    evidence: [
                        ...evaluation.evidence,
                        'Policy contract requires at least one prior in-step action before terminal pass.'
                    ]
                },
                adjusted: true,
                reason: 'Terminal pass blocked because it was attempted as first in-step action'
            };
        }

        if (evaluation.evidence.length < profile.terminalPassMinEvidenceItems) {
            return {
                evaluation: {
                    decision: 'need_retry',
                    summary: `Terminal pass rejected: insufficient evidence (${evaluation.evidence.length}/${profile.terminalPassMinEvidenceItems}).`,
                    advice: 'Collect and report at least two concrete evidence points before passing.',
                    confidence: this.normalizeRetryConfidence(evaluation.confidence),
                    evidence: [
                        ...evaluation.evidence,
                        `Policy contract requires at least ${profile.terminalPassMinEvidenceItems} evidence items for terminal pass.`
                    ]
                },
                adjusted: true,
                reason: 'Terminal pass blocked due to insufficient evidence count'
            };
        }

        if (evaluation.confidence < profile.terminalPassMinConfidence) {
            return {
                evaluation: {
                    decision: 'need_retry',
                    summary: `Terminal pass confidence ${evaluation.confidence.toFixed(2)} below required ${profile.terminalPassMinConfidence.toFixed(2)}.`,
                    advice: 'Gather one more explicit confirmation signal before passing.',
                    confidence: this.normalizeRetryConfidence(evaluation.confidence),
                    evidence: [
                        ...evaluation.evidence,
                        `Policy contract requires confidence >= ${profile.terminalPassMinConfidence.toFixed(2)} for terminal pass.`
                    ]
                },
                adjusted: true,
                reason: 'Terminal pass blocked due to low confidence threshold'
            };
        }

        return null;
    }

    private resolveProfile(overrides?: Partial<VerificationPolicyProfile>): VerificationPolicyProfile {
        return {
            ...this.defaultProfile,
            ...(overrides ?? {})
        };
    }

    private normalizeRetryConfidence(confidence: number, floor: number = 0.55): number {
        return Math.max(confidence, floor);
    }

    private accept(evaluation: LLMEvaluationDecision, reason: string): VerificationPolicyDecision {
        return {
            evaluation,
            adjusted: false,
            reason
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
