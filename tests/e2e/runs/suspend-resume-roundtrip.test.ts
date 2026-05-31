import 'reflect-metadata';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { SQLiteRunRepository } from '@infrastructure/persistence/SQLiteRunRepository';
import { SQLiteCheckpointRepository } from '@infrastructure/persistence/SQLiteCheckpointRepository';
import { FileSystemStorage } from '@infrastructure/FileSystemStorage';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { RunDurabilityService } from '@backend/runs/RunDurabilityService';
import { RunSuspensionService } from '@backend/runs/RunSuspensionService';
import { Run } from '@domain/entities/Run';
import { RunIdFactory, UrlFactory } from '@domain/value-objects';
import { WorkflowState } from '@domain/value-objects/WorkflowState';
import { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import { createInMemoryDb } from '../../support/tempDb';
import type { ConversationSnapshot } from '@domain/value-objects/ConversationSnapshot';
import type { IAgentRuntime } from '@domain/ports/agent/IAgentRuntime';
import type { IEventBus } from '@domain/ports/platform/IEventBus';

let tmpRoot: string;

function createSessionedRuntime(): IAgentRuntime & { sessions: Map<string, unknown[]> } {
    const sessions = new Map<string, unknown[]>();
    const r = {
        sessions,
        async *run() {
            return { kind: 'done' as const, output: { summary: 'ok', verdict: 'pass' as const } };
        },
        async snapshotConversation(runId: string): Promise<ConversationSnapshot | null> {
            const events = sessions.get(runId);
            if (!events) return null;
            return { providerKind: 'roundtrip', capturedAt: Date.now(), events };
        },
        async restoreConversation(runId: string, snapshot: ConversationSnapshot): Promise<void> {
            sessions.set(runId, snapshot.events as unknown[]);
        },
    };
    return r as IAgentRuntime & { sessions: Map<string, unknown[]> };
}

function recordingBus(): IEventBus & { events: Array<{ name: string; payload: unknown }> } {
    const events: Array<{ name: string; payload: unknown }> = [];
    return {
        events,
        emit: (name, payload) => events.push({ name, payload }),
        on: () => () => undefined,
    };
}

beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'domia-roundtrip-'));
});

afterEach(async () => {
    if (tmpRoot) await fs.remove(tmpRoot);
});

describe('Suspend → snapshot to disk → fresh process resume', () => {
    it('survives a simulated process restart: state, conversation, and platform config all rehydrate', async () => {
        const provider = ((): { artifactsDir: string; recordingsDir: string; reportsDir: string } => ({
            artifactsDir: tmpRoot, recordingsDir: tmpRoot, reportsDir: tmpRoot,
        })) as never;

        const { db: db1 } = await createInMemoryDb();
        const runRepo1 = new SQLiteRunRepository(db1);
        const checkpoint1 = new SQLiteCheckpointRepository(db1);
        const dur1 = new RunDurabilityService(checkpoint1, new ConsoleLogger());
        const storage1 = new FileSystemStorage(provider);
        const runtimeA = createSessionedRuntime();
        const bus1 = recordingBus();
        const suspension1 = new RunSuspensionService(runRepo1, dur1, bus1, new ConsoleLogger(), storage1, runtimeA);

        const id = RunIdFactory.create();
        const run = Run.start(Run.create({ id, url: UrlFactory.unsafe('https://example.com'), prompt: 'long task' }));
        const platformConfigJson = JSON.stringify({ platform: 'web', url: 'https://example.com' });
        const save = await runRepo1.saveRun(run, platformConfigJson);
        if (save.isErr()) throw save.error;

        runtimeA.sessions.set(id, [
            { id: 'evt-user-1', invocationId: 'inv-1', author: 'user', actions: {}, content: { role: 'user', parts: [{ text: 'hello' }] } },
            { id: 'evt-model-1', invocationId: 'inv-2', author: 'agent', actions: {}, content: { role: 'model', parts: [{ text: 'thinking' }] } },
        ]);

        const stateAtSuspend = WorkflowState.transitionTo(
            { ...WorkflowState.initial(), stepNumber: 7 },
            'thinking',
        );
        await suspension1.suspend(id, stateAtSuspend, 'awaiting batch job');

        const snapshotPath = (await dur1.getCheckpointRecords(id))
            .find((r) => r.reason === CheckpointReason.RunSuspended)!
            .metadata as { conversationSnapshotPath: string };
        expect(await fs.pathExists(snapshotPath.conversationSnapshotPath)).toBe(true);
        const onDisk = await fs.readJson(snapshotPath.conversationSnapshotPath) as ConversationSnapshot;
        expect(Array.isArray(onDisk.events)).toBe(true);
        expect((onDisk.events as unknown[]).length).toBe(2);

        const runtimeB = createSessionedRuntime();
        expect(await runtimeB.snapshotConversation(id)).toBeNull();

        const dur2 = new RunDurabilityService(checkpoint1, new ConsoleLogger());
        const storage2 = new FileSystemStorage(provider);
        const suspension2 = new RunSuspensionService(runRepo1, dur2, recordingBus(), new ConsoleLogger(), storage2, runtimeB);
        const envelope = await suspension2.loadResumptionEnvelope(id);
        expect(envelope).not.toBeNull();
        expect(envelope!.platformConfigJson).toBe(platformConfigJson);
        expect(envelope!.state.stepNumber).toBe(7);
        expect(envelope!.reason).toBe('awaiting batch job');
        expect(envelope!.conversationSnapshot).not.toBeNull();
        expect(envelope!.conversationSnapshot!.events).toEqual(onDisk.events);

        await runtimeB.restoreConversation(id, envelope!.conversationSnapshot!);
        const restored = await runtimeB.snapshotConversation(id);
        expect(restored?.events).toHaveLength(2);

        await suspension2.markResumed(id, envelope!.state);
        const after = (await runRepo1.getRun(id))._unsafeUnwrap()!;
        expect(after.status.type).toBe('running');

        const records = await dur2.getCheckpointRecords(id);
        const reasons = records.map((r) => r.reason);
        expect(reasons).toContain(CheckpointReason.RunSuspended);
        expect(reasons).toContain(CheckpointReason.RunResumed);
    });
});
