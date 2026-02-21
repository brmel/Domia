import type { AgentAction } from '@domain/value-objects';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';

export interface IRunLifecycleEngine {
    applyAction(state: WorkflowState, action: AgentAction): WorkflowState;
    clearActiveItem(state: WorkflowState): WorkflowState;
}
