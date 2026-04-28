import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { PlaywrightAdapter } from '@infrastructure/playwright/PlaywrightAdapter';
import { PlaywrightStream } from '@infrastructure/playwright/observation/PlaywrightStream';
import { PlaywrightSampler } from '@infrastructure/playwright/observation/PlaywrightSampler';
import { PerceptionPipeline } from '@infrastructure/perception/PerceptionPipeline';
import { VisionSensor } from '@infrastructure/perception/sensors/VisionSensor';
import { AriaSensor } from '@infrastructure/playwright/perception/AriaSensor';
import { SmartScrollCapture } from '@infrastructure/playwright/perception/SmartScrollCapture';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { ObservationCoordinator } from '@backend/observation/ObservationCoordinator';
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

describe('PlaywrightStream + ObservationCoordinator (e2e)', () => {
    it('LongWait profile produces frames over time and stops cleanly', async () => {
        const logger = new ConsoleLogger();
        const pipeline = new PerceptionPipeline(logger, new VisionSensor(new SmartScrollCapture(logger)), new AriaSensor());
        const source = adapter.getPerceptionSource();
        if (!source) throw new Error('no perception source');

        const sampler = new PlaywrightSampler(pipeline, source, false);
        const stream = new PlaywrightStream(() => adapter.getPlaywrightPage(), logger);

        const coordinator = new ObservationCoordinator({
            runId: 'r1' as RunId,
            sampler,
            stream,
            events: noopBus,
            logger,
            initialProfile: ObservationProfile.LongWait,
        });

        await coordinator.start();
        await new Promise((r) => setTimeout(r, 12_000));

        const recent = coordinator.recent(15_000);
        await coordinator.stop();
        expect(recent.length).toBeGreaterThanOrEqual(1);
        for (const frame of recent) {
            expect(frame.runId).toBe('r1');
            expect(frame.source).toBe('playwright.stream');
            const screenshot = frame.attachments.find((a) => a.id === 'screenshot');
            expect(screenshot).toBeDefined();
        }
    }, 60_000);
});
