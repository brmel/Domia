import { inject, injectable } from 'tsyringe';
import type { ICheckpointRepository } from '@domain/ports/ICheckpointRepository';
import type { ILogger } from '@domain/ports';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import type { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import type { CheckpointRecord } from '@domain/value-objects/CheckpointReadModel';

@injectable()
export class RunDurabilityService {
    private readonly lastSignatureByRun = new Map<string, string>();

    constructor(
        @inject('ICheckpointRepository') private readonly persistence: ICheckpointRepository,
        @inject('ILogger') private readonly logger: ILogger
    ) {}

    async checkpoint(runId: string, state: WorkflowState, reason: CheckpointReason): Promise<void> {
        const signature = `${reason}:${state.stepNumber}:${state.status}:${state.history.length}`;
        if (this.lastSignatureByRun.get(runId) === signature) return;

        const result = await this.persistence.saveCheckpoint(runId, state, reason);

        if (result.isErr()) {
            this.logger.warn(`[RunDurabilityService] Checkpoint failed: ${result.error.message}`, { runId, reason });
            return;
        }

        this.lastSignatureByRun.set(runId, signature);
    }

    async getCheckpointRecords(runId: string): Promise<readonly CheckpointRecord[]> {
        const result = await this.persistence.getCheckpointRecords(runId);
        if (result.isErr()) {
            this.logger.warn(`[RunDurabilityService] Could not load checkpoints: ${result.error.message}`, { runId });
            return [];
        }
        return result.value;
    }
}
