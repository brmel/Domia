import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import { ElectronDriver } from '@infrastructure/playwright/electron/ElectronDriver';
import { ElectronWindowSelectionPolicy } from '@infrastructure/playwright/electron/ElectronWindowSelectionPolicy';
import type { PlaywrightAdapter } from '@infrastructure/playwright/PlaywrightAdapter';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { getFreePort } from '../cli/helpers/cli-test-helpers';

const ELECTRON_BIN = path.join(
    process.cwd(),
    'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
);
const FIXTURE_MAIN = path.join(process.cwd(), 'tests/fixtures/electron-app/main.cjs');

describe.skipIf(process.platform !== 'darwin')('electron executable launch', () => {
    const logger = new ConsoleLogger();
    let driver: ElectronDriver;

    beforeAll(async () => {
        driver = new ElectronDriver(new ElectronWindowSelectionPolicy(logger), logger);
        const port = await getFreePort();
        const result = await driver.connect({
            executablePath: ELECTRON_BIN,
            launchArgs: [FIXTURE_MAIN],
            cdpPort: port,
        });
        if (result.isErr()) throw result.error;
    }, 60_000);

    afterAll(async () => {
        await driver.disconnect();
    });

    it('launches the app, injects the CDP port, and finds the window', () => {
        expect(driver.windowManager.getWindowCount()).toBeGreaterThan(0);
        expect(driver.windowManager.getActiveWindow()?.title).toBe('Domia Fixture App');
    });

    it('drives the launched app end-to-end', async () => {
        const automation = driver.getAutomation();
        automation.updateRefs({ e1: { role: 'button', name: 'Click Me' } });

        const click = await automation.click('e1');
        expect(click.isOk()).toBe(true);

        const page = (automation as PlaywrightAdapter).getPlaywrightPage();
        expect(await page!.innerText('#output')).toBe('clicked');
    }, 30_000);
});
