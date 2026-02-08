
import { injectable, inject } from 'tsyringe';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import type { ILogger, IPersistenceAdapter } from '@domain/ports';
import { WorkflowState, WorkflowStatus } from '@domain/value-objects/WorkflowState';
import { TestRunId } from '@domain/value-objects';

@injectable()
export class WorkflowEngine {
    constructor(
        @inject('IPersistenceAdapter') private persistence: IPersistenceAdapter,
        @inject('ILogger') private logger: ILogger
    ) { }

    /**
     * Transitions the workflow to a new state, persisting the change atomically.
     */
    async transition(
        runId: TestRunId,
        currentState: WorkflowState,
        nextStatus: WorkflowStatus,
        updates: Partial<WorkflowState> = {}
    ): Promise<ResultAsync<WorkflowState, Error>> {

        const nextState: WorkflowState = {
            ...currentState,
            status: nextStatus,
            ...updates,
            // Increment step number if we are moving to a new logical step (e.g. Planning)
            stepNumber: nextStatus === 'planning' ? currentState.stepNumber + 1 : currentState.stepNumber
        };

        this.logger.debug(`[WorkflowEngine] Transitioning ${runId}: ${currentState.status} -> ${nextStatus}`);

        // Persist state BEFORE returning (Durable Execution)
        try {
            // We need to implement saveCheckpoint in IPersistenceAdapter
            await this.persistence.saveCheckpoint(runId, nextState);
            return okAsync(nextState);
        } catch (error) {
            this.logger.error(`[WorkflowEngine] Failed to persist state transition`, error);
            return errAsync(new Error(`State persistence failed: ${error}`));
        }
    }

    /**
     * Resumes a workflow from the last persisted state.
     */
    async resume(runId: TestRunId): Promise<ResultAsync<WorkflowState, Error>> {
        try {
            // persistence returns ResultAsync
            const result = await this.persistence.getCheckpoint(runId);

            if (result.isErr()) {
                return errAsync(new Error(`Failed to load checkpoint: ${result.error}`));
            }

            const state = result.value;
            if (!state) {
                return okAsync(WorkflowState.initial());
            }
            this.logger.info(`[WorkflowEngine] Resuming ${runId} from state: ${state.status}`);
            return okAsync(state);
        } catch (error) {
            return errAsync(new Error(`Failed to resume workflow: ${error}`));
        }
    }
}
