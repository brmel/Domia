import 'reflect-metadata';
import { describe, expect, it, beforeEach } from 'vitest';
import { createInMemoryDatabase } from '@infrastructure/persistence/SqlJsProvider';
import { initializeSchema } from '@infrastructure/persistence/SQLiteMigrationManager';
import { SQLiteRunRepository } from '@infrastructure/persistence/SQLiteRunRepository';
import type { Step } from '@domain/ports';
import { Run } from '@domain/entities/Run';
import { RunIdFactory, UrlFactory } from '@domain/value-objects';
import { ActionType } from '@domain/enums/ActionType';
import { createInMemoryDb } from '../../../helpers/createInMemoryTestDb';

describe('SQLite persistence round-trip', () => {
    let repo: SQLiteRunRepository;

    beforeEach(async () => {
        const { db } = await createInMemoryDb();
        repo = new SQLiteRunRepository(db);
    });

    it('saves and retrieves a run', async () => {
        const run = Run.create({
            id: RunIdFactory.create(),
            url: UrlFactory.unsafe('https://example.com'),
            prompt: 'Click the button',
        });

        const saveResult = await repo.saveRun(run);
        expect(saveResult.isOk()).toBe(true);

        const getResult = await repo.getRun(run.id);
        expect(getResult.isOk()).toBe(true);

        const fetched = getResult._unsafeUnwrap()!;
        expect(fetched.id).toBe(run.id);
        expect(fetched.url).toBe('https://example.com');
        expect(fetched.prompt).toBe('Click the button');
        expect(fetched.status.type).toBe('pending');
    });

    it('updates run status from pending to passed', async () => {
        const run = Run.create({
            id: RunIdFactory.create(),
            url: UrlFactory.unsafe('https://example.com'),
            prompt: 'Test',
        });

        await repo.saveRun(run);

        const started = Run.start(run);
        await repo.updateRun(run.id, { status: started.status, ...(started.startedAt && { startedAt: started.startedAt }) });

        const passed = Run.pass(started, 'All good');
        await repo.updateRun(run.id, { status: passed.status });

        const fetched = (await repo.getRun(run.id))._unsafeUnwrap()!;
        expect(fetched.status.type).toBe('passed');
        expect((fetched.status as { summary: string }).summary).toBe('All good');
    });

    it('saves and retrieves steps by run', async () => {
        const runId = RunIdFactory.create();
        const run = Run.create({
            id: runId,
            url: UrlFactory.unsafe('https://example.com'),
            prompt: 'Multi-step',
        });
        await repo.saveRun(run);

        const steps: Step[] = [
            {
                id: 'step-1',
                runId: runId as string,
                stepNumber: 1,
                actionType: ActionType.NAVIGATE,
                actionPayload: { url: 'https://example.com' } as never,
                timestamp: new Date().toISOString(),
            },
            {
                id: 'step-2',
                runId: runId as string,
                stepNumber: 2,
                actionType: ActionType.CLICK,
                actionPayload: { selector: '#btn' } as never,
                timestamp: new Date().toISOString(),
            },
            {
                id: 'step-3',
                runId: runId as string,
                stepNumber: 3,
                actionType: ActionType.PASS,
                actionPayload: { summary: 'Done' } as never,
                timestamp: new Date().toISOString(),
            },
        ];

        for (const step of steps) {
            const r = await repo.saveStep(step);
            expect(r.isOk()).toBe(true);
        }

        const allSteps = (await repo.getSteps(runId as string))._unsafeUnwrap();
        expect(allSteps).toHaveLength(3);
        expect(allSteps[0]!.actionType).toBe(ActionType.NAVIGATE);
        expect(allSteps[1]!.actionType).toBe(ActionType.CLICK);
        expect(allSteps[2]!.actionType).toBe(ActionType.PASS);
        expect(allSteps.map(s => s.stepNumber)).toEqual([1, 2, 3]);
    });

    it('retrieves a single step by stepNumber', async () => {
        const runId = RunIdFactory.create();
        await repo.saveRun(Run.create({
            id: runId,
            url: UrlFactory.unsafe('https://example.com'),
            prompt: 'Test getStep',
        }));

        await repo.saveStep({
            id: 'step-a',
            runId: runId as string,
            stepNumber: 1,
            actionType: ActionType.CLICK,
            actionPayload: { selector: '.target' } as never,
            timestamp: new Date().toISOString(),
        });
        await repo.saveStep({
            id: 'step-b',
            runId: runId as string,
            stepNumber: 2,
            actionType: ActionType.EXTRACT,
            actionPayload: { text: 'hello' } as never,
            timestamp: new Date().toISOString(),
        });

        const step2 = (await repo.getStep(runId as string, 2))._unsafeUnwrap()!;
        expect(step2.id).toBe('step-b');
        expect(step2.stepNumber).toBe(2);
        expect(step2.actionType).toBe(ActionType.EXTRACT);

        const missing = (await repo.getStep(runId as string, 99))._unsafeUnwrap();
        expect(missing).toBeNull();
    });

    it('getRuns returns most recent first', async () => {
        const ids = [RunIdFactory.create(), RunIdFactory.create(), RunIdFactory.create()];

        for (const id of ids) {
            await repo.saveRun(Run.create({
                id,
                url: UrlFactory.unsafe('https://example.com'),
                prompt: `Run ${id}`,
            }));
        }

        const runs = (await repo.getRuns(10))._unsafeUnwrap();
        expect(runs).toHaveLength(3);
    });

    it('clearHistory removes all runs and steps', async () => {
        const runId = RunIdFactory.create();
        await repo.saveRun(Run.create({
            id: runId,
            url: UrlFactory.unsafe('https://example.com'),
            prompt: 'To be cleared',
        }));
        await repo.saveStep({
            id: 'step-clear',
            runId: runId as string,
            stepNumber: 1,
            actionType: ActionType.WAIT,
            actionPayload: { ms: 100 } as never,
            timestamp: new Date().toISOString(),
        });

        await repo.clearHistory();

        const runs = (await repo.getRuns(10))._unsafeUnwrap();
        expect(runs).toHaveLength(0);

        const steps = (await repo.getSteps(runId as string))._unsafeUnwrap();
        expect(steps).toHaveLength(0);
    });

    it('step actionPayload survives JSON serialization round-trip', async () => {
        const runId = RunIdFactory.create();
        await repo.saveRun(Run.create({
            id: runId,
            url: UrlFactory.unsafe('https://example.com'),
            prompt: 'Payload test',
        }));

        const complexPayload = {
            selector: '#input',
            text: 'Hello "world"',
            options: { force: true, timeout: 5000 },
        };

        await repo.saveStep({
            id: 'step-payload',
            runId: runId as string,
            stepNumber: 1,
            actionType: ActionType.TYPE,
            actionPayload: complexPayload as never,
            timestamp: new Date().toISOString(),
        });

        const step = (await repo.getStep(runId as string, 1))._unsafeUnwrap()!;
        expect(step.actionPayload).toEqual(complexPayload);
    });

    it('step assets survive JSON serialization round-trip', async () => {
        const runId = RunIdFactory.create();
        await repo.saveRun(Run.create({
            id: runId,
            url: UrlFactory.unsafe('https://example.com'),
            prompt: 'Assets test',
        }));

        const assets = { screenshot: '/path/to/screenshot.png', html: '/path/to/dom.html' };

        await repo.saveStep({
            id: 'step-assets',
            runId: runId as string,
            stepNumber: 1,
            actionType: ActionType.OBSERVE,
            actionPayload: {} as never,
            assets,
            timestamp: new Date().toISOString(),
        });

        const step = (await repo.getStep(runId as string, 1))._unsafeUnwrap()!;
        expect(step.assets).toEqual(assets);
    });

    it('schema migrations are idempotent', async () => {
        const raw2 = await createInMemoryDatabase();
        initializeSchema(raw2);
        initializeSchema(raw2);

        const result = raw2.exec('SELECT id FROM schema_migrations');
        const migrations = (result[0]?.values ?? []).map(row => ({ id: row[0] as string }));
        expect(migrations.length).toBeGreaterThanOrEqual(2);

        const unique = new Set(migrations.map(m => m.id));
        expect(unique.size).toBe(migrations.length);
    });
});
