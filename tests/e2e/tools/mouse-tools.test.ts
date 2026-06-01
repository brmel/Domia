import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { PlaywrightAdapter } from '@infrastructure/playwright/PlaywrightAdapter';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { UrlFactory } from '@domain/value-objects/Brand';
import { startFixtureServer, type FixtureServerHandle } from '../cli/helpers/web-fixture-server';

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/pages/dom-tools');

let server: FixtureServerHandle;
let adapter: PlaywrightAdapter;

beforeAll(async () => {
    server = await startFixtureServer(FIXTURE_DIR);
    adapter = new PlaywrightAdapter(new ConsoleLogger());
    const launchResult = await adapter.launch({ headless: true });
    if (launchResult.isErr()) throw launchResult.error;
    const navResult = await adapter.navigateTo(UrlFactory.unsafe(server.baseUrl));
    if (navResult.isErr()) throw navResult.error;
});

afterAll(async () => {
    await adapter?.close();
    await server?.stop();
});

describe('Mouse tools (e2e)', () => {
    it('moves, clicks, double-clicks, drags and scrolls against a real page', async () => {
        expect((await adapter.mouseMove(120, 120)).isOk()).toBe(true);
        expect((await adapter.mouseClick(120, 120, 'left')).isOk()).toBe(true);
        expect((await adapter.mouseClick(120, 120, 'right')).isOk()).toBe(true);
        expect((await adapter.mouseDoubleClick(120, 120)).isOk()).toBe(true);
        expect((await adapter.mouseDrag(60, 60, 180, 180)).isOk()).toBe(true);
        expect((await adapter.mouseScroll(0, 200)).isOk()).toBe(true);
    });
});
