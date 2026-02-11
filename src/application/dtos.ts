
import { AgentAction, TestRunId } from '../domain/value-objects';
import { WorkflowError } from '../domain/errors';
import type { PlatformConfig } from '../domain/types/PlatformConfig';

export interface RunTestInput {
    url?: string;
    platformConfig?: PlatformConfig;
    prompt: string;
    options?: {
        maxSteps?: number;
        headless?: boolean;
        vision?: boolean;
        debugScreenshots?: boolean;
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
