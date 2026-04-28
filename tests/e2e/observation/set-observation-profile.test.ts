import 'reflect-metadata';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
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
import { createObservationTools } from '@infrastructure/tools/catalog/observation.tools';
import { PostActionCaptureMiddleware } from '@infrastructure/tools/PostActionCaptureMiddleware';
import { ObservationProfile } from '@domain/value-objects';
import type { RunId } from '@domain/value-objects';
import { UrlFactory } from '@domain/value-objects/Brand';
import { ActionType } from '@domain/enums';
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

describe('set_observation_profile tool', () => {
    it('switches the coordinator profile and reports the previous value', async () => {
        const logger = new ConsoleLogger();
        const source = adapter.getPerceptionSource();
        if (!source) throw new Error('no perception source');

        const sampler = new PlaywrightSampler(new PerceptionPipeline(logger, new VisionSensor(new SmartScrollCapture(logger)), new AriaSensor()), source, false);
        const stream = new PlaywrightStream(() => adapter.getPlaywrightPage(), logger);
        const coordinator = new ObservationCoordinator({
            runId: 'r-set-profile' as RunId,
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
            const setProfile = tools.find((t) => t.name === 'set_observation_profile')!;
            expect(setProfile.actionType).toBe(ActionType.SET_OBSERVATION_PROFILE);

            const r1 = await setProfile.execute({ profile: 'long-wait' }) as { status: string; profile: string; previous: string };
            expect(r1.status).toBe('success');
            expect(r1.profile).toBe('long-wait');
            expect(r1.previous).toBe('on-demand');
            expect(coordinator.currentProfile()).toBe('long-wait');

            const r2 = await setProfile.execute({ profile: 'long-wait' }) as { status: string; profile: string; previous: string };
            expect(r2.profile).toBe('long-wait');
            expect(r2.previous).toBe('long-wait');
        } finally {
            await coordinator.stop();
        }
    }, 30_000);

    it('parameters schema accepts the five known profiles and rejects others', () => {
        const middleware = {} as unknown as PostActionCaptureMiddleware;
        const source = adapter.getPerceptionSource()!;
        const tools = createObservationTools(adapter, middleware, source, {
            currentProfile: () => ObservationProfile.OnDemand,
            setProfile: async () => undefined,
        } as never);
        const setProfile = tools.find((t) => t.name === 'set_observation_profile')!;

        for (const valid of ['off', 'on-demand', 'long-wait', 'quick-action', 'high-fidelity']) {
            expect(() => setProfile.parameters.parse({ profile: valid })).not.toThrow();
        }
        expect(() => setProfile.parameters.parse({ profile: 'invalid' })).toThrow();
    });

    it('tool is omitted when no observation coordinator is wired', () => {
        const middleware = {} as unknown as PostActionCaptureMiddleware;
        const tools = createObservationTools(adapter, middleware, adapter.getPerceptionSource()!);
        expect(tools.find((t) => t.name === 'set_observation_profile')).toBeUndefined();
    });
});
