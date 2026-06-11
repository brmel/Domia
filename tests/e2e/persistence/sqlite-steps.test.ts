import 'reflect-metadata';
import { describe, expect, it, beforeEach } from 'vitest';
import { SQLiteRunRepository } from '@infrastructure/persistence/SQLiteRunRepository';
import type { Step } from '@domain/ports';
import { RunIdFactory, UrlFactory } from '@domain/value-objects';
import { ActionType } from '@domain/enums';
import { createInMemoryDb } from '../../support/tempDb';
import { createRun } from '../../support/runFixtures';

describe('SQLite step persistence', () => {
    let repo: SQLiteRunRepository;

    beforeEach(async () => {
        const { db } = await createInMemoryDb();
        repo = new SQLiteRunRepository(db);
    });

    it('saves and retrieves steps by run', async () => {
        const runId = RunIdFactory.create();
        const run = createRun({
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
                actionType: ActionType.FINISH,
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
        expect(allSteps[2]!.actionType).toBe(ActionType.FINISH);
        expect(allSteps.map(s => s.stepNumber)).toEqual([1, 2, 3]);
    });

    it('retrieves a single step by stepNumber', async () => {
        const runId = RunIdFactory.create();
        await repo.saveRun(createRun({
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

    it('step actionPayload survives JSON serialization round-trip', async () => {
        const runId = RunIdFactory.create();
        await repo.saveRun(createRun({
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
        await repo.saveRun(createRun({
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
});
