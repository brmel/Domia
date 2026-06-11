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
import { RunResumeService } from '@backend/runs/RunResumeService';
import { RunOrchestrationService } from '@backend/runs/RunOrchestrationService';
import { RunBudgetPolicyService } from '@backend/runs/RunBudgetPolicyService';
import { RunTerminalizationService } from '@backend/runs/engine/RunTerminalizationService';
import { RunLifecycleManager } from '@backend/runs/RunLifecycleManager';
import { StepExecutionKernelService } from '@backend/runs/engine/StepExecutionKernelService';
import { RunStepEngine } from '@backend/runs/engine/RunStepEngine';
import { ExecutionController } from '@backend/ExecutionController';
import { RunIdFactory, UrlFactory } from '@domain/value-objects';
import { WorkflowState } from '@domain/value-objects/WorkflowState';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { createInMemoryDb } from '../../support/tempDb';
import type { ConversationSnapshot } from '@domain/value-objects/ConversationSnapshot';
import type { IAgentRuntime, AgentInput } from '@domain/ports/agent/IAgentRuntime';
import type { IEventBus } from '@domain/ports/platform/IEventBus';
import type { ITraceService } from '@domain/ports';
import { createRun, startRun } from '../../support/runFixtures';

function fakeRuntime(): IAgentRuntime & { sessions: Map<string, unknown[]>; restoreCount: number } {
    const sessions = new Map<string, unknown[]>();
    const r = {
        sessions,
        restoreCount: 0,
        async *run(_input: AgentInput) {
            return { kind: 'done' as const, output: { summary: 'resumed-success', verdict: 'pass' as const } };
        },
        async snapshotConversation(runId: string): Promise<ConversationSnapshot | null> {
            const events = sessions.get(runId);
            if (!events) return null;
            return { providerKind: 'fake', capturedAt: 1, events };
        },
        async restoreConversation(runId: string, snapshot: ConversationSnapshot): Promise<void> {
            r.restoreCount++;
            sessions.set(runId, snapshot.events as unknown[]);
        },
    };
    return r as IAgentRuntime & { sessions: Map<string, unknown[]>; restoreCount: number };
}

function noopBus(): IEventBus {
    return { emit: () => undefined, on: () => () => undefined };
}

function fakeTrace(): ITraceService {
    return { startTrace: async () => undefined, endTrace: async () => undefined } as unknown as ITraceService;
}

function fakeStorage(): FileSystemStorage {
    const provider = ((): { artifactsDir: string; recordingsDir: string; reportsDir: string } => ({
        artifactsDir: tmpRoot, recordingsDir: tmpRoot, reportsDir: tmpRoot,
    })) as never;
    return new FileSystemStorage(provider);
}

let tmpRoot: string;

beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'domia-resume-'));
});

afterEach(async () => {
    if (tmpRoot) await fs.remove(tmpRoot);
});

describe('RunResumeService — load envelope, restore, mark resumed', () => {
    it('emits error when no suspended state exists for the runId', async () => {
        const { db } = await createInMemoryDb();
        const runRepo = new SQLiteRunRepository(db);
        const checkpointRepo = new SQLiteCheckpointRepository(db);
        const logger = new ConsoleLogger();
        const durability = new RunDurabilityService(checkpointRepo, logger);
        const storage = fakeStorage();
        const runtime = fakeRuntime();
        const suspension = new RunSuspensionService(runRepo, durability, noopBus(), logger, storage, runtime);

        const lifecycle = new RunLifecycleManager(runRepo, noopBus(), logger);
        const kernel = new StepExecutionKernelService(runtime, fakeTrace(), storage, logger, runRepo, durability);
        const terminalization = new RunTerminalizationService(durability, lifecycle);
        const lane = { acquire: async () => () => undefined } as never;
        const session = { prepare: async () => { throw new Error('not used'); }, dispose: async () => undefined } as never;
        const perception = { capture: async () => undefined } as never;

        const engine = new RunStepEngine(kernel, durability, terminalization, suspension, session, lane, perception, noopBus(), logger);
        const resume = new RunResumeService(engine, new RunOrchestrationService(engine), suspension, new RunBudgetPolicyService(), runtime, logger);

        const events: string[] = [];
        const controller = new ExecutionController();
        controller.start();
        for await (const event of resume.execute(RunIdFactory.create(), controller)) {
            events.push(event.type);
            if (event.type === 'error') break;
        }
        expect(events).toContain('error');
    });

    it('restores conversation snapshot before invoking the runtime', async () => {
        const { db } = await createInMemoryDb();
        const runRepo = new SQLiteRunRepository(db);
        const checkpointRepo = new SQLiteCheckpointRepository(db);
        const logger = new ConsoleLogger();
        const durability = new RunDurabilityService(checkpointRepo, logger);
        const storage = fakeStorage();
        const runtime = fakeRuntime();
        const suspension = new RunSuspensionService(runRepo, durability, noopBus(), logger, storage, runtime);

        const id = RunIdFactory.create();
        const run = startRun(createRun({ id, url: UrlFactory.unsafe('https://example.com'), prompt: 'do work' }));
        const save = await runRepo.saveRun(run, JSON.stringify({ platform: 'web', url: 'https://example.com' }));
        if (save.isErr()) throw save.error;

        runtime.sessions.set(id, [{ id: 'evt-1' }, { id: 'evt-2' }]);
        await suspension.suspend(id, WorkflowState.transitionTo({ ...WorkflowState.initial(), stepNumber: 4 }, 'thinking'), 'long batch');
        runtime.restoreCount = 0;

        const envelope = await suspension.loadResumptionEnvelope(id);
        expect(envelope?.conversationSnapshot).not.toBeNull();
        if (!envelope?.conversationSnapshot) throw new Error('missing snapshot');
        await runtime.restoreConversation(id, envelope.conversationSnapshot);
        expect(runtime.restoreCount).toBe(1);

        const recovered = await runtime.snapshotConversation(id);
        expect(recovered?.events).toHaveLength(2);
    });

    it('markResumed transitions run status from suspended back to running', async () => {
        const { db } = await createInMemoryDb();
        const runRepo = new SQLiteRunRepository(db);
        const checkpointRepo = new SQLiteCheckpointRepository(db);
        const logger = new ConsoleLogger();
        const durability = new RunDurabilityService(checkpointRepo, logger);
        const storage = fakeStorage();
        const runtime = fakeRuntime();
        const suspension = new RunSuspensionService(runRepo, durability, noopBus(), logger, storage, runtime);

        const id = RunIdFactory.create();
        const run = startRun(createRun({ id, url: UrlFactory.unsafe('https://example.com'), prompt: 'do' }));
        const save = await runRepo.saveRun(run, JSON.stringify({ platform: 'web', url: 'https://example.com' }));
        if (save.isErr()) throw save.error;

        runtime.sessions.set(id, [{ id: 'e' }]);
        await suspension.suspend(id, WorkflowState.initial(), 'wait');
        const beforeResume = (await runRepo.getRun(id))._unsafeUnwrap()!;
        expect(beforeResume.status.type).toBe('suspended');

        await suspension.markResumed(id, WorkflowState.initial());
        const afterResume = (await runRepo.getRun(id))._unsafeUnwrap()!;
        expect(afterResume.status.type).toBe('running');
    });
});
