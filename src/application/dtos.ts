
import { AgentAction, TestRunId } from '../domain/value-objects';
import { WorkflowError } from '../domain/errors';



export interface RunTestInput {
    url: string;
    prompt: string;
    options?: {
        maxSteps?: number;
        headless?: boolean;
    };
}

export type RunTestOutput =
    | { type: 'started'; testRunId: TestRunId }
    | { type: 'observing' }
    | { type: 'thinking' }
    | { type: 'acting'; action: AgentAction }
    | { type: 'state_updated'; state: import('../domain/value-objects').WorkflowState }
    | { type: 'completed'; success: boolean; summary?: string }
    | { type: 'error'; error: WorkflowError | Error };
