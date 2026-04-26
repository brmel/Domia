import { AgentAction, RunId } from '@domain/value-objects';
import { WorkflowError } from '@domain/errors';
import type { PlatformConfig } from '@domain/types/PlatformConfig';
import type { RunIntent, RunOptions } from '@shared/contracts/run';

export interface RunInput {
    platformConfig: PlatformConfig;
    prompt: string;
    intent?: RunIntent;
    options?: RunOptions;
}

export type RunOutput =
    | { type: 'started'; runId: RunId }
    | { type: 'thinking_chunk'; text: string }
    | { type: 'acting'; action: AgentAction }
    | { type: 'state_updated'; state: import('@domain/value-objects').WorkflowState }
    | { type: 'completed'; success: boolean; summary?: string }
    | { type: 'cancelled'; summary?: string }
    | { type: 'error'; error: WorkflowError | Error };
