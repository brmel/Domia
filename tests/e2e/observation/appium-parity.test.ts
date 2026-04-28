import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { AppiumSampler } from '@infrastructure/appium/observation/AppiumSampler';
import { AppiumStream } from '@infrastructure/appium/observation/AppiumStream';
import { ObservationCoordinator } from '@backend/observation/ObservationCoordinator';
import { ObservationProfile } from '@domain/value-objects';
import type { RunId } from '@domain/value-objects';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';

const noopBus = { emit: () => {}, on: () => () => {} };

describe('Appium observation parity', () => {
    it('AppiumSampler returns a frame shaped to the IObservationSampler contract', async () => {
        const sampler = new AppiumSampler();
        const frame = await sampler.sample({ runId: 'r-appium' as RunId, hint: 'unit-test' });
        expect(frame.runId).toBe('r-appium');
        expect(frame.source).toBe('appium.sampler');
        expect(typeof frame.capturedAt).toBe('number');
        expect(Array.isArray(frame.attachments)).toBe(true);
    });

    it('AppiumStream supports start/subscribe/setProfile/stop lifecycle', async () => {
        const stream = new AppiumStream();
        const runId = 'r-appium-stream' as RunId;
        expect(stream.isRunning(runId)).toBe(false);

        await stream.start(runId, ObservationProfile.LongWait);
        expect(stream.isRunning(runId)).toBe(true);

        const sub = stream.subscribe(runId, () => undefined);
        expect(typeof sub.unsubscribe).toBe('function');
        await stream.setProfile(runId, ObservationProfile.QuickAction);
        sub.unsubscribe();

        await stream.stop(runId);
        expect(stream.isRunning(runId)).toBe(false);
    });

    it('ObservationCoordinator drives Appium stubs through OnDemand sample()', async () => {
        const sampler = new AppiumSampler();
        const stream = new AppiumStream();
        const coordinator = new ObservationCoordinator({
            runId: 'r-mobile' as RunId,
            sampler,
            stream,
            events: noopBus,
            logger: new ConsoleLogger(),
            initialProfile: ObservationProfile.OnDemand,
        });

        await coordinator.start();
        try {
            const frame = await coordinator.sample('appium-unit');
            expect(frame.source).toBe('appium.sampler');
            expect(coordinator.recent(60_000)).toHaveLength(1);
        } finally {
            await coordinator.stop();
        }
    });

    it('ObservationCoordinator transitions Off → LongWait → Off using the Appium stream', async () => {
        const sampler = new AppiumSampler();
        const stream = new AppiumStream();
        const coordinator = new ObservationCoordinator({
            runId: 'r-mobile-transition' as RunId,
            sampler,
            stream,
            events: noopBus,
            logger: new ConsoleLogger(),
            initialProfile: ObservationProfile.Off,
        });

        await coordinator.start();
        try {
            await coordinator.setProfile(ObservationProfile.LongWait);
            expect(stream.isRunning('r-mobile-transition' as RunId)).toBe(true);
            await coordinator.setProfile(ObservationProfile.Off);
            expect(stream.isRunning('r-mobile-transition' as RunId)).toBe(false);
        } finally {
            await coordinator.stop();
        }
    });
});
