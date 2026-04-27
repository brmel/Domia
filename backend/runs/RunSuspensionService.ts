import { inject, injectable } from 'tsyringe';
import { Run } from '@domain/entities/Run';
import type { IRunRepository } from '@domain/ports/IRunRepository';
import type { IEventBus } from '@domain/ports/IEventBus';
import type { ILogger } from '@domain/ports';
import type { RunId } from '@domain/value-objects';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import { RunDurabilityService } from './RunDurabilityService';

export interface RunResumptionEnvelope {
    readonly runId: RunId;
    readonly state: WorkflowState;
    readonly platformConfigJson: string | null;
    readonly suspendedAt: string;
    readonly reason: string;
}

@injectable()
export class RunSuspensionService {
    constructor(
        @inject('IRunRepository') private readonly runs: IRunRepository,
        @inject(RunDurabilityService) private readonly durability: RunDurabilityService,
        @inject('IEventBus') private readonly events: IEventBus,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    async suspend(runId: RunId, state: WorkflowState, reason: string): Promise<void> {
        const existing = await this.runs.getRun(runId);
        if (existing.isErr() || !existing.value) {
            throw new Error(`Cannot suspend run ${runId}: not found`);
        }
        const suspended = Run.suspend(existing.value, reason);
        const update = await this.runs.updateRun(runId, { status: suspended.status, updatedAt: suspended.updatedAt });
        if (update.isErr()) throw update.error;

        await this.durability.checkpoint(runId, state, CheckpointReason.RunSuspended);
        this.events.emit('run.suspended', { runId, reason });
        this.logger.info(`[RunSuspensionService] Suspended runId=${runId} reason=${reason}`);
    }

    async loadResumptionEnvelope(runId: RunId): Promise<RunResumptionEnvelope | null> {
        const records = await this.durability.getCheckpointRecords(runId);
        const lastSuspension = [...records].reverse().find((r) => r.reason === CheckpointReason.RunSuspended);
        if (!lastSuspension) return null;

        const platformConfigResult = await this.runs.getPlatformConfigJson(runId);
        const platformConfigJson = platformConfigResult.isOk() ? platformConfigResult.value : null;

        const runResult = await this.runs.getRun(runId);
        const reason = runResult.isOk() && runResult.value?.status.type === 'suspended'
            ? runResult.value.status.reason
            : '';

        return {
            runId,
            state: lastSuspension.state,
            platformConfigJson,
            suspendedAt: lastSuspension.createdAt,
            reason,
        };
    }

    async markResumed(runId: RunId, state: WorkflowState): Promise<void> {
        const existing = await this.runs.getRun(runId);
        if (existing.isErr() || !existing.value) {
            throw new Error(`Cannot resume run ${runId}: not found`);
        }
        if (existing.value.status.type !== 'suspended') {
            throw new Error(`Cannot resume run ${runId}: status is ${existing.value.status.type}`);
        }
        const resumed = Run.resume(existing.value);
        const update = await this.runs.updateRun(runId, { status: resumed.status, updatedAt: resumed.updatedAt });
        if (update.isErr()) throw update.error;

        await this.durability.checkpoint(runId, state, CheckpointReason.RunResumed);
        this.events.emit('run.resumed', { runId });
        this.logger.info(`[RunSuspensionService] Resumed runId=${runId}`);
    }
}
