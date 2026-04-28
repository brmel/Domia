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
import { createObservationTools } from '@infrastructure/tools/catalog/observation.tools';
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

describe('recall_recent tool (e2e)', () => {
    it('returns frames captured within the recent window', async () => {
        const logger = new ConsoleLogger();
        const source = adapter.getPerceptionSource();
        if (!source) throw new Error('no perception source');

        const sampler = new PlaywrightSampler(new PerceptionPipeline(logger, new VisionSensor(new SmartScrollCapture(logger)), new AriaSensor()), source, false);
        const stream = new PlaywrightStream(() => adapter.getPlaywrightPage(), logger);
        const coordinator = new ObservationCoordinator({
            runId: 'r-recall' as RunId,
            sampler,
            stream,
            events: noopBus,
            logger,
            initialProfile: ObservationProfile.OnDemand,
        });
        await coordinator.start();

        try {
            await coordinator.sample('first');
            await coordinator.sample('second');

            const middleware = {} as unknown as PostActionCaptureMiddleware;
            const tools = createObservationTools(adapter, middleware, source, coordinator);
            const recallRecent = tools.find((t) => t.name === 'recall_recent');
            expect(recallRecent).toBeDefined();

            const result = await recallRecent!.execute({ sinceMs: 60_000 }) as {
                status: string;
                count: number;
                frames: Array<{ source: string; summary: string; capturedAt: number; attachmentSummaries: Array<{ id: string }> }>;
            };

            expect(result.status).toBe('success');
            expect(result.count).toBe(2);
            expect(result.frames[0]?.source).toBe('playwright.sampler');
            expect(result.frames[0]?.attachmentSummaries.some((a) => a.id === 'aria')).toBe(true);
        } finally {
            await coordinator.stop();
        }
    }, 30_000);

    it('returns empty frames when no frames are within the window', async () => {
        const logger = new ConsoleLogger();
        const source = adapter.getPerceptionSource();
        if (!source) throw new Error('no perception source');

        const sampler = new PlaywrightSampler(new PerceptionPipeline(logger, new VisionSensor(new SmartScrollCapture(logger)), new AriaSensor()), source, false);
        const stream = new PlaywrightStream(() => adapter.getPlaywrightPage(), logger);
        const coordinator = new ObservationCoordinator({
            runId: 'r-recall-empty' as RunId,
            sampler,
            stream,
            events: noopBus,
            logger,
            initialProfile: ObservationProfile.OnDemand,
        });
        await coordinator.start();

        try {
            const middleware = {} as unknown as PostActionCaptureMiddleware;
            const tools = createObservationTools(adapter, middleware, source, coordinator);
            const recallRecent = tools.find((t) => t.name === 'recall_recent');
            const result = await recallRecent!.execute({ sinceMs: 1000 }) as { status: string; count: number };
            expect(result.status).toBe('success');
            expect(result.count).toBe(0);
        } finally {
            await coordinator.stop();
        }
    }, 30_000);

    it('errors when no observation coordinator is wired', async () => {
        const middleware = {} as unknown as PostActionCaptureMiddleware;
        const tools = createObservationTools(adapter, middleware);
        const recallRecent = tools.find((t) => t.name === 'recall_recent');
        expect(recallRecent).toBeDefined();
        const result = await recallRecent!.execute({}) as { status: string; error?: string };
        expect(result.status).toBe('error');
        expect(result.error).toMatch(/observation coordinator/i);
    });

    it('parameters schema validates sinceMs bounds', () => {
        const middleware = {} as unknown as PostActionCaptureMiddleware;
        const tools = createObservationTools(adapter, middleware);
        const recallRecent = tools.find((t) => t.name === 'recall_recent');
        expect(recallRecent!.parameters).toBeInstanceOf(z.ZodObject);
        expect(() => recallRecent!.parameters.parse({ sinceMs: 50 })).toThrow();
        expect(() => recallRecent!.parameters.parse({ sinceMs: 5000 })).not.toThrow();
        expect(() => recallRecent!.parameters.parse({})).not.toThrow();
    });
});
