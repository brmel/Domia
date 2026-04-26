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

describe('DOM tools (e2e)', () => {
    it('extracts visible heading text', async () => {
        const result = await adapter.extractText('h1#heading');
        expect(result.isOk()).toBe(true);
        if (result.isOk()) expect(result.value).toContain('DOM Tools');
    });

    it('navigates to a hash section', async () => {
        const navResult = await adapter.navigateTo(UrlFactory.unsafe(`${server.baseUrl}/#section`));
        expect(navResult.isOk()).toBe(true);
    });
});
