import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { createWebHarness, type ToolHarness } from '../../support/toolHarness';

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/pages/dom-tools');

let h: ToolHarness;

beforeAll(async () => {
    h = await createWebHarness(FIXTURE_DIR);
});

afterAll(async () => {
    await h?.close();
});

describe('Mouse tools (e2e)', () => {
    it('moves, clicks, double-clicks, drags and scrolls against a real page', async () => {
        expect((await h.automation.mouseMove(120, 120)).isOk()).toBe(true);
        expect((await h.automation.mouseClick(120, 120, 'left')).isOk()).toBe(true);
        expect((await h.automation.mouseClick(120, 120, 'right')).isOk()).toBe(true);
        expect((await h.automation.mouseDoubleClick(120, 120)).isOk()).toBe(true);
        expect((await h.automation.mouseDrag(60, 60, 180, 180)).isOk()).toBe(true);
        expect((await h.automation.mouseScroll(0, 200)).isOk()).toBe(true);
    });
});
