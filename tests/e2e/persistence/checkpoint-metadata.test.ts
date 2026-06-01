import 'reflect-metadata';
import { describe, expect, it, beforeEach } from 'vitest';
import { SQLiteCheckpointRepository } from '@infrastructure/persistence/SQLiteCheckpointRepository';
import { RunDurabilityService } from '@backend/runs/engine/RunDurabilityService';
import { WorkflowState } from '@domain/value-objects/WorkflowState';
import { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { createInMemoryDb } from '../../support/tempDb';

describe('Checkpoint metadata round-trip', () => {
    let repo: SQLiteCheckpointRepository;
    let durability: RunDurabilityService;

    beforeEach(async () => {
        const { db } = await createInMemoryDb();
        repo = new SQLiteCheckpointRepository(db);
        durability = new RunDurabilityService(repo, new ConsoleLogger());
    });

    it('persists and retrieves typed metadata for RunSuspended', async () => {
        const state = WorkflowState.transitionTo({ ...WorkflowState.initial(), stepNumber: 3 }, 'thinking');
        await durability.checkpoint('run-1', state, CheckpointReason.RunSuspended, {
            reason: 'run_suspended',
            conversationSnapshotPath: '/tmp/runs/run-1/snapshot.json',
        });

        const records = await durability.getCheckpointRecords('run-1');
        expect(records).toHaveLength(1);
        expect(records[0]!.metadata).toEqual({
            reason: 'run_suspended',
            conversationSnapshotPath: '/tmp/runs/run-1/snapshot.json',
        });
    });

    it('omits metadata field when none was provided', async () => {
        const state = WorkflowState.initial();
        await durability.checkpoint('run-2', state, CheckpointReason.PlanReady);
        const records = await durability.getCheckpointRecords('run-2');
        expect(records[0]!.metadata).toBeUndefined();
    });

    it('different metadata values bypass the dedup signature so both rows persist', async () => {
        const state = WorkflowState.initial();
        await durability.checkpoint('run-3', state, CheckpointReason.RunSuspended, {
            reason: 'run_suspended',
            conversationSnapshotPath: '/snap/a.json',
        });
        await durability.checkpoint('run-3', state, CheckpointReason.RunSuspended, {
            reason: 'run_suspended',
            conversationSnapshotPath: '/snap/b.json',
        });
        const records = await durability.getCheckpointRecords('run-3');
        expect(records).toHaveLength(2);
        expect(records.map((r) => (r.metadata as { conversationSnapshotPath: string }).conversationSnapshotPath))
            .toEqual(['/snap/a.json', '/snap/b.json']);
    });
});
