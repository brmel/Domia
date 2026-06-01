import { chromium, type Browser } from 'playwright';
import type { IStructuredAutomation } from '@domain/ports';
import type { RoleRefMap } from '@domain/value-objects/RoleRef';
import { UrlFactory } from '@domain/value-objects/Brand';
import { PlaywrightAdapter } from '@infrastructure/playwright/PlaywrightAdapter';
import { ElectronDriver } from '@infrastructure/playwright/electron/ElectronDriver';
import { ElectronWindowSelectionPolicy } from '@infrastructure/playwright/electron/ElectronWindowSelectionPolicy';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { startFixtureServer } from '../e2e/cli/helpers/web-fixture-server';
import { getFreePort } from '../e2e/cli/helpers/cli-test-helpers';

/**
 * One setup for tool/automation cases on either real platform. A test that
 * drives tools is then: `harness = await createWebHarness(dir)` (or electron),
 * use `harness.automation` + `harness.seedRefs`, `await harness.close()`.
 * Web = PlaywrightAdapter; Electron = ElectronDriver over a Chromium CDP
 * endpoint (faithful stand-in — Electron drives its target the same way).
 */
export interface ToolHarness {
    readonly automation: IStructuredAutomation;
    readonly baseUrl: string;
    seedRefs(refs: RoleRefMap): void;
    close(): Promise<void>;
}

export async function createWebHarness(fixtureDir: string): Promise<ToolHarness> {
    const server = await startFixtureServer(fixtureDir);
    const adapter = new PlaywrightAdapter(new ConsoleLogger());
    const launch = await adapter.launch({ headless: true });
    if (launch.isErr()) throw launch.error;
    const nav = await adapter.navigateTo(UrlFactory.unsafe(server.baseUrl));
    if (nav.isErr()) throw nav.error;
    return harness(adapter, server.baseUrl, async () => {
        await adapter.close();
        await server.stop();
    });
}

export interface ElectronToolHarness extends ToolHarness {
    windowCount(): number;
}

export async function createElectronHarness(fixtureDir: string): Promise<ElectronToolHarness> {
    const server = await startFixtureServer(fixtureDir);
    const port = await getFreePort();
    let cdp: Browser | undefined;
    try {
        cdp = await chromium.launch({ headless: true, args: [`--remote-debugging-port=${port}`] });
        const page = await cdp.newPage();
        await page.goto(server.baseUrl, { waitUntil: 'load' });

        const logger = new ConsoleLogger();
        const driver = new ElectronDriver(new ElectronWindowSelectionPolicy(logger), logger);
        const connected = await driver.connect({ cdpUrl: `http://127.0.0.1:${port}` });
        if (connected.isErr()) throw connected.error;

        const browser = cdp;
        const base = harness(driver.getAutomation(), server.baseUrl, async () => {
            await driver.disconnect();
            await browser.close();
            await server.stop();
        });
        return { ...base, windowCount: () => driver.windowManager.getWindowCount() };
    } catch (error) {
        await cdp?.close();
        await server.stop();
        throw error;
    }
}

function harness(automation: IStructuredAutomation, baseUrl: string, close: () => Promise<void>): ToolHarness {
    return {
        automation,
        baseUrl,
        seedRefs: (refs) => automation.updateRefs(refs),
        close,
    };
}
