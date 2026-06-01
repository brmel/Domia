import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { chromium, type Browser } from 'playwright';
import { ElectronDriver } from '@infrastructure/playwright/electron/ElectronDriver';
import { ElectronWindowSelectionPolicy } from '@infrastructure/playwright/electron/ElectronWindowSelectionPolicy';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { getFreePort } from '../cli/helpers/cli-test-helpers';
import { startFixtureServer, type FixtureServerHandle } from '../cli/helpers/web-fixture-server';

/**
 * Deterministic ElectronDriver coverage without a real Electron binary: Electron
 * exposes a Chromium CDP endpoint, and the driver connects over CDP, so a
 * Chromium launched with --remote-debugging-port is a faithful stand-in for the
 * connect + window-discovery + automation path. The full real-Electron run lives
 * in the live lane (tests/e2e/cli/electron-test.ts).
 */
const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/pages/dom-tools');

let server: FixtureServerHandle;
let cdpBrowser: Browser;
let driver: ElectronDriver;
let port: number;

beforeAll(async () => {
    server = await startFixtureServer(FIXTURE_DIR);
    port = await getFreePort();
    cdpBrowser = await chromium.launch({ headless: true, args: [`--remote-debugging-port=${port}`] });
    const page = await cdpBrowser.newPage();
    await page.goto(server.baseUrl, { waitUntil: 'load' });

    const logger = new ConsoleLogger();
    driver = new ElectronDriver(new ElectronWindowSelectionPolicy(logger), logger);
    const result = await driver.connect({ cdpUrl: `http://127.0.0.1:${port}` });
    if (result.isErr()) throw result.error;
});

afterAll(async () => {
    await driver?.disconnect();
    await cdpBrowser?.close();
    await server?.stop();
});

describe('ElectronDriver over CDP (deterministic stand-in)', () => {
    it('reports electron capabilities', () => {
        const caps = driver.getCapabilities();
        expect(caps.platform).toBe('electron');
        expect(caps.supportsDOM).toBe(true);
        expect(caps.supportsMultiWindow).toBe(true);
        expect(caps.supportsNativeInteraction).toBe(true);
    });

    it('discovers at least one window and exposes it via session extras', () => {
        expect(driver.windowManager.getWindowCount()).toBeGreaterThanOrEqual(1);
        const extras = driver.getSessionExtras();
        expect(extras?.windowManager).toBeDefined();
    });

    it('drives the connected page through the automation surface', async () => {
        const automation = driver.getAutomation();
        const url = automation.getCurrentUrl();
        expect(url).toContain('127.0.0.1');
    });
});
