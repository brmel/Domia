import 'reflect-metadata';
import { describe, expect, it, beforeEach } from 'vitest';
import { createInMemoryDatabase } from '@infrastructure/persistence/SqlJsProvider';
import { initializeSchema } from '@infrastructure/persistence/SQLiteSchema';
import { SQLiteRunRepository } from '@infrastructure/persistence/SQLiteRunRepository';
import { SQLiteCheckpointRepository } from '@infrastructure/persistence/SQLiteCheckpointRepository';
import { SQLiteSkillRepository } from '@infrastructure/persistence/SQLiteSkillRepository';
import type { Step } from '@domain/ports';
import { RunIdFactory, UrlFactory } from '@domain/value-objects';
import { WorkflowState } from '@domain/value-objects/WorkflowState';
import { ActionType } from '@domain/enums';
import { createInMemoryDb } from '../../support/tempDb';
import { createRun, startRun, passRun, finishRun } from '../../support/runFixtures';

describe('SQLite persistence round-trip', () => {
    let repo: SQLiteRunRepository;

    beforeEach(async () => {
        const { db } = await createInMemoryDb();
        repo = new SQLiteRunRepository(db);
    });

    it('saves and retrieves a run', async () => {
        const run = createRun({
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

    it('round-trips a verdict-less finished run with summary + value (W1 regression)', async () => {
        const run = createRun({
            id: RunIdFactory.create(),
            url: UrlFactory.unsafe('https://example.com'),
            prompt: 'Complete the task',
        });
        expect((await repo.saveRun(run)).isOk()).toBe(true);

        const started = startRun(run);
        const finished = finishRun(started, 'Task completed successfully', { count: 42 });
        const update = await repo.updateRun(run.id, {
            status: finished.status,
            ...(started.startedAt ? { startedAt: started.startedAt } : {}),
            updatedAt: finished.updatedAt,
        });
        expect(update.isOk()).toBe(true);

        const fetched = (await repo.getRun(run.id))._unsafeUnwrap()!;
        expect(fetched.status.type).toBe('finished');
        if (fetched.status.type === 'finished') {
            expect(fetched.status.summary).toBe('Task completed successfully');
            expect(fetched.status.value).toEqual({ count: 42 });
            expect(fetched.status.duration).toBeGreaterThanOrEqual(0);
        }
    });

    it('updates run status from pending to passed', async () => {
        const run = createRun({
            id: RunIdFactory.create(),
            url: UrlFactory.unsafe('https://example.com'),
            prompt: 'Test',
        });

        await repo.saveRun(run);

        const started = startRun(run);
        await repo.updateRun(run.id, { status: started.status, ...(started.startedAt && { startedAt: started.startedAt }) });

        const passed = passRun(started, 'All good');
        await repo.updateRun(run.id, { status: passed.status });

        const fetched = (await repo.getRun(run.id))._unsafeUnwrap()!;
        expect(fetched.status.type).toBe('passed');
        expect((fetched.status as { summary: string }).summary).toBe('All good');
    });

    it('getRuns returns most recent first', async () => {
        const ids = [RunIdFactory.create(), RunIdFactory.create(), RunIdFactory.create()];

        for (const id of ids) {
            await repo.saveRun(createRun({
                id,
                url: UrlFactory.unsafe('https://example.com'),
                prompt: `Run ${id}`,
            }));
        }

        const runs = (await repo.getRuns(10))._unsafeUnwrap();
        expect(runs).toHaveLength(3);

        // Verify ordering: most recent first (descending started_at)
        for (let i = 0; i < runs.length - 1; i++) {
            const current = new Date(runs[i]!.createdAt).getTime();
            const next = new Date(runs[i + 1]!.createdAt).getTime();
            expect(current).toBeGreaterThanOrEqual(next);
        }
    });

    it('clearHistory removes all runs and steps', async () => {
        const runId = RunIdFactory.create();
        await repo.saveRun(createRun({
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

    it('schema init is idempotent (safe to call twice)', async () => {
        const raw2 = await createInMemoryDatabase();
        initializeSchema(raw2);
        initializeSchema(raw2);

        const result = raw2.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
        const tables = new Set((result[0]?.values ?? []).map(row => row[0] as string));
        for (const expected of ['runs', 'steps', 'workflow_checkpoints', 'workflow_definitions', 'workflow_runs', 'workflow_step_runs', 'skills']) {
            expect(tables.has(expected)).toBe(true);
        }
    });

    it('full run lifecycle: run → steps → checkpoints persisted to history', async () => {
        const { db } = await createInMemoryDb();
        const runRepo = new SQLiteRunRepository(db);
        const checkpointRepo = new SQLiteCheckpointRepository(db);

        // 1. Create and save a new run
        const runId = RunIdFactory.create();
        const run = createRun({
            id: runId,
            url: UrlFactory.unsafe('https://example.com'),
            prompt: 'Verify the homepage loads correctly',
        });
        expect((await runRepo.saveRun(run)).isOk()).toBe(true);

        // 2. Transition to running
        const started = startRun(run);
        await runRepo.updateRun(run.id, {
            status: started.status,
            ...(started.startedAt && { startedAt: started.startedAt }),
        });

        // 3. Save action steps
        const steps: Step[] = [
            {
                id: 'step-observe-1',
                runId: runId as string,
                stepNumber: 1,
                actionType: ActionType.OBSERVE,
                actionPayload: {} as never,
                assets: { screenshot: '/artifacts/screenshot_1.jpg' },
                timestamp: new Date().toISOString(),
            },
            {
                id: 'step-click-2',
                runId: runId as string,
                stepNumber: 2,
                actionType: ActionType.CLICK,
                actionPayload: { ref: 'e3' } as never,
                timestamp: new Date().toISOString(),
            },
            {
                id: 'step-pass-3',
                runId: runId as string,
                stepNumber: 3,
                actionType: ActionType.FINISH,
                actionPayload: { summary: 'Homepage verified' } as never,
                timestamp: new Date().toISOString(),
            },
        ];
        for (const step of steps) {
            expect((await runRepo.saveStep(step)).isOk()).toBe(true);
        }

        // 4. Save checkpoints (verifies checkpoint_id column works)
        const state = WorkflowState.initial();
        expect((await checkpointRepo.saveCheckpoint(runId as string, state, 'run_initialized')).isOk()).toBe(true);
        expect((await checkpointRepo.saveCheckpoint(runId as string, state, 'action_applied')).isOk()).toBe(true);
        expect((await checkpointRepo.saveCheckpoint(runId as string, state, 'terminal_success')).isOk()).toBe(true);

        // 5. Mark run as passed
        const passed = passRun(started, 'Homepage loaded and verified');
        await runRepo.updateRun(run.id, { status: passed.status });

        // ── Validate full history ──

        // Runs list shows the new entry
        const allRuns = (await runRepo.getRuns(50))._unsafeUnwrap();
        expect(allRuns.length).toBeGreaterThanOrEqual(1);
        const savedRun = allRuns.find(r => r.id === runId);
        expect(savedRun).toBeDefined();
        expect(savedRun!.status.type).toBe('passed');
        expect(savedRun!.prompt).toBe('Verify the homepage loads correctly');
        expect(savedRun!.url).toBe('https://example.com');

        // Steps are persisted in order
        const savedSteps = (await runRepo.getSteps(runId as string))._unsafeUnwrap();
        expect(savedSteps).toHaveLength(3);
        expect(savedSteps.map(s => s.actionType)).toEqual([
            ActionType.OBSERVE,
            ActionType.CLICK,
            ActionType.FINISH,
        ]);
        expect(savedSteps[0]!.assets).toEqual({ screenshot: '/artifacts/screenshot_1.jpg' });

        // Individual step retrieval works
        const step2 = (await runRepo.getStep(runId as string, 2))._unsafeUnwrap();
        expect(step2).not.toBeNull();
        expect(step2!.actionPayload).toEqual({ ref: 'e3' });

        // Checkpoints are persisted with correct checkpoint_id column
        const checkpoints = (await checkpointRepo.getCheckpointRecords(runId as string))._unsafeUnwrap();
        expect(checkpoints).toHaveLength(3);
        expect(checkpoints.map(c => c.reason)).toEqual([
            'run_initialized',
            'action_applied',
            'terminal_success',
        ]);
        // Each checkpoint has a unique ID
        const cpIds = new Set(checkpoints.map(c => c.checkpointId));
        expect(cpIds.size).toBe(3);
    });
});

describe('corrupt-row reads return Err, not a thrown rejection', () => {
    it('getRun surfaces a malformed value_json as Err (run path, commit 3fcb8e1)', async () => {
        const { db, raw } = await createInMemoryDb();
        const repo = new SQLiteRunRepository(db);
        const id = RunIdFactory.create();
        raw.run(
            "INSERT INTO runs (id, url, status, started_at, value_json) VALUES (?, ?, 'finished', ?, '{not-json')",
            [id as string, 'https://example.com', new Date().toISOString()],
        );
        const result = await repo.getRun(id);
        expect(result.isErr()).toBe(true);
    });

    it('skill list surfaces a malformed parameters_json as Err (skill path, commit b0cda5b)', async () => {
        const { db, raw } = await createInMemoryDb();
        const repo = new SQLiteSkillRepository(db);
        const now = new Date().toISOString();
        raw.run(
            "INSERT INTO skills (id, name, description, parameters_json, steps_json, created_at, updated_at) VALUES ('s1', 'broken', '', '{not-json', '[]', ?, ?)",
            [now, now],
        );
        const result = await repo.list();
        expect(result.isErr()).toBe(true);
    });
});
