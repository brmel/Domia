import { inject, injectable } from 'tsyringe';
import type { IPersistenceAdapter, ILogger } from '@domain/ports';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import type { RunCheckpointReason, RunLifecycleState } from '@domain/value-objects/RunLifecycle';
import { canTransitionRunLifecycle } from '@domain/value-objects/RunLifecycle';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';

@injectable()
export class RunDurabilityService {
    private readonly lastCheckpointSignatureByRun = new Map<string, string>();

    constructor(
        @inject('IPersistenceAdapter') private readonly persistence: IPersistenceAdapter,
        @inject('ILogger') private readonly logger: ILogger
    ) {}

    transition(
        runId: string,
        current: RunLifecycleState,
        next: RunLifecycleState,
        metadata?: Record<string, unknown>
    ): RunLifecycleState {
        if (!canTransitionRunLifecycle(current, next)) {
            this.logger.warn(
                `[RunDurabilityService] Ignoring invalid lifecycle transition ${current} -> ${next}`,
                { runId, ...(metadata ?? {}) }
            );
            return current;
        }

        this.logger.info(
            `[RunDurabilityService] Lifecycle transition ${current} -> ${next}`,
            { runId, ...(metadata ?? {}) }
        );

        return next;
    }

    async checkpoint(runId: string, state: WorkflowState, reason: RunCheckpointReason): Promise<void> {
        const signature = JSON.stringify({
            reason,
            stepNumber: state.stepNumber,
            status: state.status,
            activeItemId: state.activeItemId,
            error: state.error,
            historyLength: state.history.length
        });

        const previousSignature = this.lastCheckpointSignatureByRun.get(runId);
        if (previousSignature === signature) {
            this.logger.debug('[RunDurabilityService] Checkpoint skipped (duplicate signature)', {
                runId,
                reason,
                stepNumber: state.stepNumber,
                status: state.status
            });
            return;
        }

        const result = await this.persistence.saveCheckpoint(runId, state, reason);

        if (result.isErr()) {
            this.logger.warn(`[RunDurabilityService] Checkpoint skipped: ${result.error.message}`, { runId, reason });
            return;
        }

        this.lastCheckpointSignatureByRun.set(runId, signature);

        this.logger.debug(`[RunDurabilityService] Checkpoint saved`, {
            runId,
            reason,
            stepNumber: state.stepNumber,
            status: state.status
        });
    }

    async getCheckpointRecords(runId: string): Promise<readonly CheckpointRecord[]> {
        const result = await this.persistence.getCheckpointRecords(runId);

        if (result.isErr()) {
            this.logger.warn(`[RunDurabilityService] Could not load checkpoint records: ${result.error.message}`, { runId });
            return [];
        }

        return result.value;
    }
}
