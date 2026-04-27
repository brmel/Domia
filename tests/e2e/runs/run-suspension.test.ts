import 'reflect-metadata';
import { describe, expect, it, beforeEach } from 'vitest';
import { SQLiteRunRepository } from '@infrastructure/persistence/SQLiteRunRepository';
import { SQLiteCheckpointRepository } from '@infrastructure/persistence/SQLiteCheckpointRepository';
import { RunDurabilityService } from '@backend/runs/RunDurabilityService';
import { RunSuspensionService } from '@backend/runs/RunSuspensionService';
import { Run } from '@domain/entities/Run';
import { RunIdFactory, UrlFactory } from '@domain/value-objects';
import { WorkflowState } from '@domain/value-objects/WorkflowState';
import { CheckpointReason } from '@domain/value-objects/CheckpointReason';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { createInMemoryDb } from '../../support/tempDb';
import type { DomainEventName, DomainEvents } from '@domain/events';
import type { IEventBus } from '@domain/ports/IEventBus';

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

describe('RunSuspensionService — suspend/wake foundation', () => {
    let runRepo: SQLiteRunRepository;
    let checkpointRepo: SQLiteCheckpointRepository;
    let durability: RunDurabilityService;
    let bus: ReturnType<typeof createRecordingBus>;
    let service: RunSuspensionService;

    beforeEach(async () => {
        const { db } = await createInMemoryDb();
        runRepo = new SQLiteRunRepository(db);
        checkpointRepo = new SQLiteCheckpointRepository(db);
        durability = new RunDurabilityService(checkpointRepo, new ConsoleLogger());
        bus = createRecordingBus();
        service = new RunSuspensionService(runRepo, durability, bus, new ConsoleLogger());
    });

    async function createRunningRun(): Promise<ReturnType<typeof RunIdFactory.create>> {
        const id = RunIdFactory.create();
        const created = Run.create({ id, url: UrlFactory.unsafe('https://example.com'), prompt: 'long-job' });
        const started = Run.start(created);
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
});
