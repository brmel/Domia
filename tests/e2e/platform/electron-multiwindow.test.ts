import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { ElectronDriver } from '@infrastructure/playwright/electron/ElectronDriver';
import { ElectronWindowSelectionPolicy } from '@infrastructure/playwright/electron/ElectronWindowSelectionPolicy';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { getFreePort } from '../cli/helpers/cli-test-helpers';

async function until(check: () => boolean, timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!check()) {
        if (Date.now() > deadline) throw new Error('condition not met in time');
        await new Promise((r) => setTimeout(r, 200));
    }
}

describe('electron multi-window lifecycle', () => {
    const logger = new ConsoleLogger();
    let cdpHost: Browser;
    let driver: ElectronDriver;

    beforeAll(async () => {
        const port = await getFreePort();
        cdpHost = await chromium.launch({ headless: true, args: [`--remote-debugging-port=${port}`] });
        const first = await cdpHost.newPage();
        await first.setContent('<title>Main Window</title><button id="open">Open Child</button>');

        driver = new ElectronDriver(new ElectronWindowSelectionPolicy(logger), logger);
        const connected = await driver.connect({ cdpUrl: `http://127.0.0.1:${port}` });
        if (connected.isErr()) throw connected.error;
    }, 60_000);

    afterAll(async () => {
        await driver.disconnect();
        await cdpHost.close();
    });

    it('discovers a window opened mid-run, switches to it, and drives it', async () => {
        const before = driver.windowManager.getWindowCount();

        const active = driver.windowManager.getActiveWindow();
        await active!.page.evaluate(() => {
            const child = window.open('', '_blank');
            child!.document.title = 'Child Window';
            child!.document.body.innerHTML = '<button id="cbtn" onclick="this.textContent=\'clicked\'">Child Button</button>';
        });

        await until(() => driver.windowManager.getWindowCount() === before + 1);
        const child = driver.windowManager.getAllWindows().find((w) => w.title.includes('Child'));
        expect(child).toBeDefined();

        const switched = await driver.windowManager.switchWindow(child!.id, driver.getAutomation() as never);
        expect(switched.isOk()).toBe(true);

        const automation = driver.getAutomation();
        automation.updateRefs({ e1: { role: 'button', name: 'Child Button' } });
        const click = await automation.click('e1');
        expect(click.isOk()).toBe(true);
        expect(await child!.page.innerText('#cbtn')).toBe('clicked');
    }, 30_000);

    it('prunes closed windows from the live list', async () => {
        const child = driver.windowManager.getAllWindows().find((w) => w.title.includes('Child'));
        const countWithChild = driver.windowManager.getWindowCount();
        await child!.page.close();
        await until(() => driver.windowManager.getWindowCount() === countWithChild - 1);
        expect(driver.windowManager.getAllWindows().some((w) => w.title.includes('Child'))).toBe(false);
    }, 15_000);
});
