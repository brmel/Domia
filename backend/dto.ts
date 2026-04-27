import { AgentAction, RunId } from '@domain/value-objects';
import { WorkflowError } from '@domain/errors';
import type { PlatformConfig } from '@domain/types/PlatformConfig';
import type { RunIntent, RunOptions } from '@shared/contracts/run';

export interface RunInput {
    platformConfig: PlatformConfig;
    prompt: string;
    intent?: RunIntent;
    options?: RunOptions;
    parentRunId?: RunId;
}

export type RunOutput =
    | { type: 'started'; runId: RunId }
    | { type: 'thinking_chunk'; text: string }
    | { type: 'acting'; action: AgentAction }
    | { type: 'state_updated'; state: import('@domain/value-objects').WorkflowState }
    | { type: 'completed'; success: boolean; summary?: string }
    | { type: 'cancelled'; summary?: string }
    | { type: 'error'; error: WorkflowError | Error };

export function serializeRunOutput(event: RunOutput): RunOutput {
    if (event.type === 'error' && event.error instanceof Error) {
        return {
            type: 'error',
            error: {
                name: event.error.name,
                message: event.error.message,
                code: 'code' in event.error ? (event.error as { code: string }).code : 'UNKNOWN',
            } as unknown as Error,
        };
    }
    return event;
}
