import { Plan } from '../entities/Plan';
import { AgentAction } from './AgentAction';
import { WorkflowExecutionGraph } from './ExecutionGraph';

export type WorkflowStatus =
    | 'idle'
    | 'planning'
    | 'observing'
    | 'thinking'
    | 'acting'
    | 'validating'
    | 'completed'
    | 'failed';

export interface WorkflowState {
    readonly status: WorkflowStatus;
    readonly stepNumber: number;
    readonly lastCheckpointId?: string;
    readonly variables: Record<string, unknown>;
    readonly error?: string;

    readonly plan?: Plan;
    readonly executionGraph?: WorkflowExecutionGraph;
    readonly activeItemId?: string;
    readonly activeNodeId?: string;
    readonly history: readonly AgentAction[];
}

export const WorkflowState = {
    initial(): WorkflowState {
        return {
            status: 'idle',
            stepNumber: 0,
            variables: {},
            history: []
        };
    },

    transitionTo(state: WorkflowState, status: WorkflowStatus, extra?: Partial<WorkflowState>): WorkflowState {
        return { ...state, status, ...extra };
    },

    applyAction(state: WorkflowState, action: AgentAction): WorkflowState {
        return {
            ...state,
            status: 'acting',
            stepNumber: state.stepNumber + 1,
            history: [...state.history, action]
        };
    },

    clearActiveItem(state: WorkflowState): WorkflowState {
        const { activeItemId: _, activeNodeId: __, ...rest } = state;
        return rest;
    },

    applyTerminal(state: WorkflowState, terminal: 'failed' | 'completed' | 'idle', error?: string): WorkflowState {
        return { ...state, status: terminal, ...(error ? { error } : {}) };
    }
};
