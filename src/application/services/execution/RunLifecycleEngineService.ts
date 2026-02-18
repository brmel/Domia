import { injectable } from 'tsyringe';
import type { AgentAction, LLMEvaluationDecision } from '@domain/value-objects';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';

@injectable()
export class RunLifecycleEngineService {
    applyEvaluation(state: WorkflowState, evaluation: LLMEvaluationDecision): WorkflowState {
        return {
            ...state,
            status: 'validating',
            evaluatorAdvice: evaluation.advice ?? evaluation.summary,
            evaluatorAdviceDelta: {
                decision: evaluation.decision,
                summary: evaluation.summary,
                ...(evaluation.advice ? { advice: evaluation.advice } : {}),
                evidence: evaluation.evidence,
                confidence: evaluation.confidence,
                timestamp: new Date().toISOString()
            },
            lastEvaluation: evaluation
        };
    }

    applyAction(state: WorkflowState, action: AgentAction): WorkflowState {
        return {
            ...state,
            status: 'acting',
            stepNumber: state.stepNumber + 1,
            history: [...state.history, action]
        };
    }

    clearActiveItem(state: WorkflowState): WorkflowState {
        const { activeItemId, activeNodeId, ...withoutActiveItem } = state;
        void activeItemId;
        void activeNodeId;
        return withoutActiveItem;
    }
}
