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

describe('Tab management (e2e)', () => {
    it('opens a new tab, marks it active, and counts both', async () => {
        const opened = await adapter.newTab(`${server.baseUrl}/#second`);
        expect(opened.active).toBe(true);

        const tabs = await adapter.listTabs();
        expect(tabs.length).toBe(2);
        expect(tabs.filter((t) => t.active).length).toBe(1);
    });

    it('switches focus back to the first tab', async () => {
        const switched = await adapter.switchTab(0);
        expect(switched.index).toBe(0);
        expect(switched.active).toBe(true);

        const tabs = await adapter.listTabs();
        expect(tabs[0]!.active).toBe(true);
    });

    it('closes a tab by index and reflects the new count', async () => {
        await adapter.closeTab(1);
        const tabs = await adapter.listTabs();
        expect(tabs.length).toBe(1);
    });
});
