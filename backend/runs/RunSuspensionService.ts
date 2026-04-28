import { inject, injectable } from 'tsyringe';
import { Run } from '@domain/entities/Run';
import type { IRunRepository } from '@domain/ports/IRunRepository';
import type { IEventBus } from '@domain/ports/IEventBus';
import type { ILogger, IStorageService } from '@domain/ports';
import type { IAgentRuntime } from '@domain/ports/IAgentRuntime';
import type { RunId } from '@domain/value-objects';
import type { WorkflowState } from '@domain/value-objects/WorkflowState';
import type { ConversationSnapshot } from '@domain/value-objects/ConversationSnapshot';
import { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import { RunDurabilityService } from './RunDurabilityService';

export interface RunResumptionEnvelope {
    readonly runId: RunId;
    readonly state: WorkflowState;
    readonly platformConfigJson: string | null;
    readonly suspendedAt: string;
    readonly reason: string;
    readonly conversationSnapshot: ConversationSnapshot | null;
    readonly conversationSnapshotPath: string | null;
}

@injectable()
export class RunSuspensionService {
    constructor(
        @inject('IRunRepository') private readonly runs: IRunRepository,
        @inject(RunDurabilityService) private readonly durability: RunDurabilityService,
        @inject('IEventBus') private readonly events: IEventBus,
        @inject('ILogger') private readonly logger: ILogger,
        @inject('IStorageService') private readonly storage: IStorageService,
        @inject('IAgentRuntime') private readonly agentRuntime: IAgentRuntime,
    ) {}

    async suspend(runId: RunId, state: WorkflowState, reason: string): Promise<void> {
        const existing = await this.runs.getRun(runId);
        if (existing.isErr() || !existing.value) {
            throw new Error(`Cannot suspend run ${runId}: not found`);
        }
        const suspended = Run.suspend(existing.value, reason);
        const update = await this.runs.updateRun(runId, { status: suspended.status, updatedAt: suspended.updatedAt });
        if (update.isErr()) throw update.error;

        const snapshot = await this.agentRuntime.snapshotConversation(runId);
        let snapshotPath: string | null = null;
        if (snapshot) {
            snapshotPath = await this.storage.saveConversationSnapshot(runId, snapshot);
        }

        await this.durability.checkpoint(
            runId,
            state,
            CheckpointReason.RunSuspended,
            snapshotPath ? { reason: 'run_suspended', conversationSnapshotPath: snapshotPath } : undefined,
        );
        this.events.emit('run.suspended', { runId, reason });
        this.logger.info(`[RunSuspensionService] Suspended runId=${runId} reason=${reason} snapshot=${snapshotPath ?? 'none'}`);
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

        const snapshotPath = lastSuspension.metadata?.reason === 'run_suspended'
            ? lastSuspension.metadata.conversationSnapshotPath
            : null;
        let conversationSnapshot: ConversationSnapshot | null = null;
        if (snapshotPath) {
            try {
                conversationSnapshot = await this.storage.loadConversationSnapshot(snapshotPath);
            } catch (error) {
                this.logger.warn(`[RunSuspensionService] Failed to load snapshot ${snapshotPath}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        return {
            runId,
            state: lastSuspension.state,
            platformConfigJson,
            suspendedAt: lastSuspension.createdAt,
            reason,
            conversationSnapshot,
            conversationSnapshotPath: snapshotPath,
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

        const records = await this.durability.getCheckpointRecords(runId);
        const lastSuspension = [...records].reverse().find((r) => r.reason === CheckpointReason.RunSuspended);
        const snapshotPath = lastSuspension?.metadata?.reason === 'run_suspended'
            ? lastSuspension.metadata.conversationSnapshotPath
            : null;

        await this.durability.checkpoint(
            runId,
            state,
            CheckpointReason.RunResumed,
            snapshotPath ? { reason: 'run_resumed', conversationSnapshotPath: snapshotPath } : undefined,
        );
        this.events.emit('run.resumed', { runId });
        this.logger.info(`[RunSuspensionService] Resumed runId=${runId}`);
    }
}
