import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { PlaywrightAdapter } from '@infrastructure/playwright/PlaywrightAdapter';
import { PlaywrightSampler } from '@infrastructure/playwright/observation/PlaywrightSampler';
import { PerceptionPipeline } from '@infrastructure/perception/PerceptionPipeline';
import { VisionSensor } from '@infrastructure/perception/sensors/VisionSensor';
import { AriaSensor } from '@infrastructure/playwright/perception/AriaSensor';
import { SmartScrollCapture } from '@infrastructure/playwright/perception/SmartScrollCapture';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { UrlFactory } from '@domain/value-objects/Brand';
import type { RunId } from '@domain/value-objects';
import { startFixtureServer, type FixtureServerHandle } from '../cli/helpers/web-fixture-server';

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/pages/dom-tools');

let server: FixtureServerHandle;
let adapter: PlaywrightAdapter;

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

describe('PlaywrightSampler (e2e)', () => {
    it('produces an ObservationFrame with aria + screenshot attachments', async () => {
        const logger = new ConsoleLogger();
        const pipeline = new PerceptionPipeline(logger, new VisionSensor(new SmartScrollCapture(logger)), new AriaSensor());
        const source = adapter.getPerceptionSource();
        if (!source) throw new Error('Perception source not available');

        const sampler = new PlaywrightSampler(pipeline, source, true);
        const frame = await sampler.sample({ runId: 'r1' as RunId });

        expect(frame.runId).toBe('r1');
        expect(frame.source).toBe('playwright.sampler');
        expect(frame.capturedAt).toBeGreaterThan(0);
        expect(frame.summary).toContain(server.baseUrl);

        const aria = frame.attachments.find((a) => a.id === 'aria');
        expect(aria).toBeDefined();
        expect(aria!.contentType).toBe('text/plain');
        expect(aria!.bytes).toBeGreaterThan(0);

        const screenshot = frame.attachments.find((a) => a.id === 'screenshot');
        expect(screenshot).toBeDefined();
        expect(screenshot!.contentType).toBe('image/jpeg');
        expect(screenshot!.bytes).toBeGreaterThan(0);
    });
});
