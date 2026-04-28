import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { z } from 'zod';
import { PlaywrightAdapter } from '@infrastructure/playwright/PlaywrightAdapter';
import { PlaywrightStream } from '@infrastructure/playwright/observation/PlaywrightStream';
import { PlaywrightSampler } from '@infrastructure/playwright/observation/PlaywrightSampler';
import { PerceptionPipeline } from '@infrastructure/perception/PerceptionPipeline';
import { VisionSensor } from '@infrastructure/perception/sensors/VisionSensor';
import { AriaSensor } from '@infrastructure/playwright/perception/AriaSensor';
import { SmartScrollCapture } from '@infrastructure/playwright/perception/SmartScrollCapture';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { ObservationCoordinator } from '@backend/observation/ObservationCoordinator';
import { createPollingTools } from '@infrastructure/tools/catalog/polling.tools';
import { PostActionCaptureMiddleware } from '@infrastructure/tools/PostActionCaptureMiddleware';
import { ObservationProfile } from '@domain/value-objects';
import type { RunId } from '@domain/value-objects';
import { UrlFactory } from '@domain/value-objects/Brand';
import { startFixtureServer, type FixtureServerHandle } from '../cli/helpers/web-fixture-server';

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/pages/dom-tools');

let server: FixtureServerHandle;
let adapter: PlaywrightAdapter;

const noopBus = { emit: () => {}, on: () => () => {} };

beforeAll(async () => {
    server = await startFixtureServer(FIXTURE_DIR);
    adapter = new PlaywrightAdapter(new ConsoleLogger());
    const launch = await adapter.launch({ headless: true });
    if (launch.isErr()) throw launch.error;
    const nav = await adapter.navigateTo(UrlFactory.unsafe(server.baseUrl));
    if (nav.isErr()) throw nav.error;
});

afterAll(async () => {
    await adapter?.close();
    await server?.stop();
});

describe('wait_for_change tool (e2e)', () => {
    it('returns timeout status when no matching frame arrives in window', async () => {
        const logger = new ConsoleLogger();
        const source = adapter.getPerceptionSource();
        if (!source) throw new Error('no perception source');

        const sampler = new PlaywrightSampler(new PerceptionPipeline(logger, new VisionSensor(new SmartScrollCapture(logger)), new AriaSensor()), source, false);
        const stream = new PlaywrightStream(() => adapter.getPlaywrightPage(), logger);
        const coordinator = new ObservationCoordinator({
            runId: 'r1' as RunId,
            sampler,
            stream,
            events: noopBus,
            logger,
            initialProfile: ObservationProfile.QuickAction,
        });
        await coordinator.start();

        try {
            const middleware = {} as unknown as PostActionCaptureMiddleware;
            const tools = createPollingTools(adapter, middleware, coordinator, 'r1');
            const waitForChange = tools.find((t) => t.name === 'wait_for_change');
            expect(waitForChange).toBeDefined();

            const result = await waitForChange!.execute({
                pattern: 'pattern-that-will-never-appear-' + Date.now(),
                timeoutMs: 1500,
            }) as { status: string; elapsedMs: number };

            expect(result.status).toBe('timeout');
            expect(result.elapsedMs).toBeGreaterThanOrEqual(1500);
        } finally {
            await coordinator.stop();
        }
    }, 30_000);

    it('parameters schema accepts pattern + timeout', () => {
        const middleware = {} as unknown as PostActionCaptureMiddleware;
        const tools = createPollingTools(adapter, middleware);
        const waitForChange = tools.find((t) => t.name === 'wait_for_change');
        expect(waitForChange).toBeDefined();
        expect(waitForChange!.parameters).toBeInstanceOf(z.ZodObject);
        const parsed = waitForChange!.parameters.parse({ pattern: 'foo', timeoutMs: 5000 });
        expect(parsed).toMatchObject({ pattern: 'foo', timeoutMs: 5000 });
    });
});
