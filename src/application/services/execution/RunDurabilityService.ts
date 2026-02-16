import { inject, injectable } from 'tsyringe';
import { randomUUID } from 'crypto';
import type { IPersistenceAdapter, ILogger } from '@domain/ports';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import type { RunCheckpointReason, RunLifecycleState } from '@domain/value-objects/RunLifecycle';
import { canTransitionRunLifecycle } from '@domain/value-objects/RunLifecycle';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';

@injectable()
export class RunDurabilityService {
    private readonly lastCheckpointSignatureByRun = new Map<string, string>();
    private readonly lastCheckpointIdByRun = new Map<string, string>();
    private readonly checkpointSequenceByRun = new Map<string, number>();
    private readonly checkpointBranchByRun = new Map<string, string>();

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

        const checkpointId = randomUUID();
        const parentCheckpointId = state.lastCheckpointId ?? this.lastCheckpointIdByRun.get(runId) ?? null;
        const branchId = this.checkpointBranchByRun.get(runId) ?? `run:${runId}:main`;
        const sequenceNumber = (this.checkpointSequenceByRun.get(runId) ?? 0) + 1;
        const checkpointState: WorkflowState = {
            ...state,
            lastCheckpointId: checkpointId
        };

        const result = await this.persistence.saveCheckpoint(runId, checkpointState, reason, {
            checkpointId,
            parentCheckpointId,
            branchId,
            sequenceNumber
        });

        if (result.isErr()) {
            this.logger.warn(`[RunDurabilityService] Checkpoint skipped: ${result.error.message}`, { runId, reason });
            return;
        }

        this.lastCheckpointSignatureByRun.set(runId, signature);
        this.lastCheckpointIdByRun.set(runId, checkpointId);
        this.checkpointSequenceByRun.set(runId, sequenceNumber);
        this.checkpointBranchByRun.set(runId, branchId);

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
