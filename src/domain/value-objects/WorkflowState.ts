import { Plan } from '../entities/Plan';
import { AgentAction } from './AgentAction';
import { WorkflowExecutionGraph } from './ExecutionGraph';
import { LLMEvaluationDecision } from './LLMEvaluationDecision';

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
    readonly evaluatorAdvice?: string;
    readonly lastEvaluation?: LLMEvaluationDecision;
}

export const WorkflowState = {
    initial(): WorkflowState {
        return {
            status: 'idle',
            stepNumber: 0,
            variables: {},
            history: []
        };
    }
};
