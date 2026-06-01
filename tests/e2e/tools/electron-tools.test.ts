import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { createElectronHarness, type ElectronToolHarness } from '../../support/toolHarness';

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/pages/dom-tools');

let h: ElectronToolHarness;

beforeAll(async () => {
    h = await createElectronHarness(FIXTURE_DIR);
});

afterAll(async () => {
    await h?.close();
});

describe('Tools over Electron (e2e, CDP stand-in)', () => {
    it('sees a window and drives the same automation surface as web', async () => {
        expect(h.windowCount()).toBeGreaterThanOrEqual(1);

        h.seedRefs({ heading: { role: 'heading', name: 'DOM Tools' } });
        const result = await h.automation.extractText('heading');
        expect(result.isOk()).toBe(true);
        if (result.isOk()) expect(result.value).toContain('DOM Tools');

        expect((await h.automation.mouseMove(100, 100)).isOk()).toBe(true);
    });
});
