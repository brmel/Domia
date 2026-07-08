import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildToolCatalog } from '@infrastructure/tools/buildToolCatalog';
import type { ToolDependencies } from '@infrastructure/tools/ToolSpec';
import { AppiumAdapter } from '@infrastructure/appium/AppiumAdapter';
import { PerceptionPipeline } from '@infrastructure/perception/PerceptionPipeline';
import { VisionSensor } from '@infrastructure/perception/sensors/VisionSensor';
import { SmartScrollCapture } from '@infrastructure/playwright/perception/SmartScrollCapture';
import { AriaSensor } from '@infrastructure/playwright/perception/AriaSensor';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { createWebHarness, type ToolHarness } from '../../support/toolHarness';
import type { PlaywrightAdapter } from '@infrastructure/playwright/PlaywrightAdapter';
import type { AppCapabilities } from '@domain/ports/automation/IAppDriver';
import { Platform } from '@domain/value-objects';

const logger = new ConsoleLogger();
const perception = new PerceptionPipeline(logger, new VisionSensor(new SmartScrollCapture(logger)), new AriaSensor());

function catalogNames(deps: ToolDependencies): string[] {
    return buildToolCatalog(deps).catalog.map((t) => t.name);
}

describe('tool catalog gating per platform', () => {
    let web: ToolHarness;

    beforeAll(async () => {
        web = await createWebHarness('tests/fixtures/pages');
    }, 60_000);

    afterAll(async () => {
        await web.close();
    });

    it('web gets DOM, tab, and mouse tools', () => {
        const names = catalogNames({
            automation: web.automation,
            logger,
            perception,
            perceptionSource: web.automation.getPerceptionSource()!,
            vision: false,
            platform: Platform.Web,
            capabilities: { platform: Platform.Web, supportsDOM: true, supportsVision: true, supportsMultiWindow: false, supportsNativeInteraction: false },
            tabManager: web.automation as PlaywrightAdapter,
        });
        for (const expected of ['click', 'type', 'extract', 'extract_page_content', 'selectOption', 'mouse_click_left', 'open_tab', 'finish', 'iterate']) {
            expect(names, expected).toContain(expected);
        }
        expect(names).not.toContain('list_windows');
    });

    it('mobile gets ref interaction but no DOM-only or browser tools', () => {
        const adapter = new AppiumAdapter(logger, {
            platform: Platform.Mobile,
            appiumServerUrl: 'http://127.0.0.1:4723',
            capabilities: { os: 'android', appPackage: 'com.example', appActivity: '.Main', deviceName: 'emu', platformVersion: '14' },
        });
        const capabilities: AppCapabilities = {
            platform: Platform.Mobile,
            supportsDOM: false,
            supportsVision: true,
            supportsMultiWindow: false,
            supportsNativeInteraction: true,
        };
        const names = catalogNames({
            automation: adapter,
            logger,
            perception,
            perceptionSource: adapter.getPerceptionSource()!,
            vision: false,
            platform: Platform.Mobile,
            capabilities,
        });
        for (const expected of ['click', 'type', 'extract', 'pressKey', 'finish', 'iterate', 'suspend']) {
            expect(names, expected).toContain(expected);
        }
        for (const excluded of ['selectOption', 'dragTo', 'extract_page_content', 'mouse_click_left', 'open_tab', 'list_windows', 'startRecording']) {
            expect(names, excluded).not.toContain(excluded);
        }
    });
});
