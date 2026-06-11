import 'reflect-metadata';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { SQLiteRunRepository } from '@infrastructure/persistence/SQLiteRunRepository';
import { SQLiteCheckpointRepository } from '@infrastructure/persistence/SQLiteCheckpointRepository';
import { FileSystemStorage } from '@infrastructure/FileSystemStorage';
import { RunDurabilityService } from '@backend/runs/engine/RunDurabilityService';
import { RunSuspensionService } from '@backend/runs/engine/RunSuspensionService';
import { RunIdFactory, UrlFactory } from '@domain/value-objects';
import { WorkflowState } from '@domain/value-objects/WorkflowState';
import { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { createInMemoryDb } from '../../support/tempDb';
import type { DomainEventName, DomainEvents } from '@domain/events';
import type { IEventBus } from '@domain/ports/platform/IEventBus';
import type { IAgentRuntime } from '@domain/ports/agent/IAgentRuntime';
import type { ConversationSnapshot } from '@domain/value-objects/ConversationSnapshot';
import { createRun, startRun } from '../../support/runFixtures';

function createRecordingBus(): IEventBus & { events: Array<{ name: DomainEventName; payload: unknown }> } {
    const events: Array<{ name: DomainEventName; payload: unknown }> = [];
    return {
        events,
        emit<E extends DomainEventName>(name: E, payload: DomainEvents[E]): void {
            events.push({ name, payload });
        },
        on: () => () => undefined,
    };
}

function createFakeRuntime(): IAgentRuntime & { sessions: Map<string, unknown[]> } {
    const sessions = new Map<string, unknown[]>();
    return {
        sessions,
        async *run() { return { kind: 'error', cause: new Error('not used in this test') }; },
        async snapshotConversation(runId: string): Promise<ConversationSnapshot | null> {
            const events = sessions.get(runId);
            if (!events) return null;
            return { providerKind: 'fake', capturedAt: 1, events };
        },
        async restoreConversation(runId: string, snapshot: ConversationSnapshot): Promise<void> {
            sessions.set(runId, snapshot.events as unknown[]);
        },
    } as unknown as IAgentRuntime & { sessions: Map<string, unknown[]> };
}

describe('RunSuspensionService — suspend/wake foundation', () => {
    let runRepo: SQLiteRunRepository;
    let checkpointRepo: SQLiteCheckpointRepository;
    let durability: RunDurabilityService;
    let bus: ReturnType<typeof createRecordingBus>;
    let service: RunSuspensionService;
    let storage: FileSystemStorage;
    let runtime: ReturnType<typeof createFakeRuntime>;
    let tmpRoot: string;

    beforeEach(async () => {
        tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'domia-suspend-'));
        const { db } = await createInMemoryDb();
        runRepo = new SQLiteRunRepository(db);
        checkpointRepo = new SQLiteCheckpointRepository(db);
        durability = new RunDurabilityService(checkpointRepo, new ConsoleLogger());
        bus = createRecordingBus();
        const provider = ((): { artifactsDir: string; recordingsDir: string; reportsDir: string } => ({
            artifactsDir: tmpRoot, recordingsDir: tmpRoot, reportsDir: tmpRoot,
        })) as never;
        storage = new FileSystemStorage(provider);
        runtime = createFakeRuntime();
        service = new RunSuspensionService(runRepo, durability, bus, new ConsoleLogger(), storage, runtime);
    });

    afterEach(async () => {
        if (tmpRoot) await fs.remove(tmpRoot);
    });

    async function createRunningRun(): Promise<ReturnType<typeof RunIdFactory.create>> {
        const id = RunIdFactory.create();
        const created = createRun({ id, url: UrlFactory.unsafe('https://example.com'), prompt: 'long-job' });
        const started = startRun(created);
        const save = await runRepo.saveRun(started, JSON.stringify({ platform: 'web', url: 'https://example.com' }));
        if (save.isErr()) throw save.error;
        return id;
    }

    it('suspend persists status, writes checkpoint, and emits run.suspended', async () => {
        const runId = await createRunningRun();
        const stateAt = WorkflowState.transitionTo(
            { ...WorkflowState.initial(), stepNumber: 4 },
            'thinking',
        );

        await service.suspend(runId, stateAt, 'awaiting external approval');

        const fetched = (await runRepo.getRun(runId))._unsafeUnwrap()!;
        expect(fetched.status.type).toBe('suspended');
        expect((fetched.status as { reason: string }).reason).toBe('awaiting external approval');

        const records = await durability.getCheckpointRecords(runId);
        const suspensionRecord = records.find((r) => r.reason === CheckpointReason.RunSuspended);
        expect(suspensionRecord).toBeDefined();
        expect(suspensionRecord!.state.stepNumber).toBe(4);

        const emitted = bus.events.find((e) => e.name === 'run.suspended');
        expect(emitted).toBeDefined();
        expect((emitted!.payload as { reason: string }).reason).toBe('awaiting external approval');
    });

    it('loadResumptionEnvelope returns the most recent suspension state and platform config', async () => {
        const runId = await createRunningRun();
        const earlyState = WorkflowState.transitionTo({ ...WorkflowState.initial(), stepNumber: 1 }, 'thinking');
        await service.suspend(runId, earlyState, 'first');

        const envelope = await service.loadResumptionEnvelope(runId);
        expect(envelope).not.toBeNull();
        expect(envelope!.runId).toBe(runId);
        expect(envelope!.state.stepNumber).toBe(1);
        expect(envelope!.reason).toBe('first');
        expect(envelope!.platformConfigJson).toContain('"platform":"web"');
        expect(envelope!.suspendedAt).toBeTruthy();
    });

    it('loadResumptionEnvelope returns null when run was never suspended', async () => {
        const runId = await createRunningRun();
        const envelope = await service.loadResumptionEnvelope(runId);
        expect(envelope).toBeNull();
    });

    it('markResumed transitions suspended → running and writes RunResumed checkpoint', async () => {
        const runId = await createRunningRun();
        const stateAt = WorkflowState.transitionTo({ ...WorkflowState.initial(), stepNumber: 7 }, 'acting');
        await service.suspend(runId, stateAt, 'pause for review');
        await service.markResumed(runId, stateAt);

        const fetched = (await runRepo.getRun(runId))._unsafeUnwrap()!;
        expect(fetched.status.type).toBe('running');

        const records = await durability.getCheckpointRecords(runId);
        const resumedRecord = records.find((r) => r.reason === CheckpointReason.RunResumed);
        expect(resumedRecord).toBeDefined();

        const emitted = bus.events.find((e) => e.name === 'run.resumed');
        expect(emitted).toBeDefined();
    });

    it('markResumed throws when run is not currently suspended', async () => {
        const runId = await createRunningRun();
        const stateAt = WorkflowState.initial();
        await expect(service.markResumed(runId, stateAt)).rejects.toThrow(/not found|status is/);
    });

    it('suspend rejects unknown runId', async () => {
        await expect(
            service.suspend('does-not-exist' as ReturnType<typeof RunIdFactory.create>, WorkflowState.initial(), 'x')
        ).rejects.toThrow(/not found/);
    });

    it('suspend captures the conversation snapshot to disk and stores its path on the checkpoint', async () => {
        const runId = await createRunningRun();
        runtime.sessions.set(runId, [{ id: 'evt-1', text: 'hello' }, { id: 'evt-2', text: 'world' }]);

        await service.suspend(runId, WorkflowState.initial(), 'long wait');

        const records = await durability.getCheckpointRecords(runId);
        const suspendCheckpoint = records.find((r) => r.reason === CheckpointReason.RunSuspended);
        expect(suspendCheckpoint?.metadata?.reason).toBe('run_suspended');
        const snapshotPath = (suspendCheckpoint!.metadata as { conversationSnapshotPath: string }).conversationSnapshotPath;
        expect(await fs.pathExists(snapshotPath)).toBe(true);

        const envelope = await service.loadResumptionEnvelope(runId);
        expect(envelope?.conversationSnapshot).not.toBeNull();
        expect(envelope?.conversationSnapshot?.events).toEqual([{ id: 'evt-1', text: 'hello' }, { id: 'evt-2', text: 'world' }]);
        expect(envelope?.conversationSnapshotPath).toBe(snapshotPath);
    });

    it('suspend with no live conversation persists checkpoint without snapshot metadata', async () => {
        const runId = await createRunningRun();
        await service.suspend(runId, WorkflowState.initial(), 'no convo');
        const records = await durability.getCheckpointRecords(runId);
        const suspendCheckpoint = records.find((r) => r.reason === CheckpointReason.RunSuspended);
        expect(suspendCheckpoint?.metadata).toBeUndefined();
        const envelope = await service.loadResumptionEnvelope(runId);
        expect(envelope?.conversationSnapshot).toBeNull();
        expect(envelope?.conversationSnapshotPath).toBeNull();
    });

    it('markResumed propagates the latest snapshot path on the RunResumed checkpoint', async () => {
        const runId = await createRunningRun();
        runtime.sessions.set(runId, [{ id: 'e' }]);
        await service.suspend(runId, WorkflowState.initial(), 'pause');
        await service.markResumed(runId, WorkflowState.initial());
        const records = await durability.getCheckpointRecords(runId);
        const resumed = records.find((r) => r.reason === CheckpointReason.RunResumed);
        expect(resumed?.metadata?.reason).toBe('run_resumed');
        expect((resumed!.metadata as { conversationSnapshotPath: string }).conversationSnapshotPath).toMatch(/conversation-snapshot\.json$/);
    });
});
