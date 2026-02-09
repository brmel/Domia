
import { AgentAction, TestRunId } from '../domain/value-objects';
import { WorkflowError } from '../domain/errors';

import { TestStep } from '../domain/entities';

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
    | { type: 'step_complete'; step: TestStep }
    | { type: 'completed'; success: boolean; summary?: string }
    | { type: 'error'; error: WorkflowError | Error };
