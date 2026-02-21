import { injectable } from 'tsyringe';
import type { AgentAction } from '@domain/value-objects';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import type { IRunLifecycleEngine } from './IRunLifecycleEngine';

@injectable()
export class RunLifecycleEngineService implements IRunLifecycleEngine {
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
