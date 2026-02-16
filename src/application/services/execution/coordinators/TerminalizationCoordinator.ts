import { injectable } from 'tsyringe';
import type { WorkflowState } from '@domain/value-objects';

@injectable()
export class TerminalizationCoordinator {
    applyTerminalState(
        state: WorkflowState,
        terminal: 'failed' | 'completed' | 'idle',
        error?: string
    ): WorkflowState {
        return {
            ...state,
            status: terminal,
            ...(error ? { error } : {})
        };
    }
}
