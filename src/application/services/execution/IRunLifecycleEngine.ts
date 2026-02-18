import type { AgentAction, LLMEvaluationDecision } from '@domain/value-objects';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';

export interface IRunLifecycleEngine {
    applyEvaluation(state: WorkflowState, evaluation: LLMEvaluationDecision): WorkflowState;
    applyAction(state: WorkflowState, action: AgentAction): WorkflowState;
    clearActiveItem(state: WorkflowState): WorkflowState;
}
