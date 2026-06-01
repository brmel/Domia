import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { UrlFactory } from '@domain/value-objects/Brand';
import { createWebHarness, type ToolHarness } from '../../support/toolHarness';

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/pages/dom-tools');

let h: ToolHarness;

beforeAll(async () => {
    h = await createWebHarness(FIXTURE_DIR);
});

afterAll(async () => {
    await h?.close();
});

function seedRefs(): void {
    h.seedRefs({
        heading: { role: 'heading', name: 'DOM Tools' },
        nameInput: { role: 'textbox' },
        submitBtn: { role: 'button', name: 'Submit' },
        resultPara: { role: 'status' },
    });
}

describe('DOM tools (e2e)', () => {
    it('extracts visible heading text', async () => {
        seedRefs();
        const result = await h.automation.extractText('heading');
        expect(result.isOk()).toBe(true);
        if (result.isOk()) expect(result.value).toContain('DOM Tools');
    });

    it('navigates to a hash section', async () => {
        const navResult = await h.automation.navigateTo(UrlFactory.unsafe(`${h.baseUrl}/#section`));
        expect(navResult.isOk()).toBe(true);
    });

    it('types into an input and clicks a button to mutate the DOM', async () => {
        const navResult = await h.automation.navigateTo(UrlFactory.unsafe(h.baseUrl));
        expect(navResult.isOk()).toBe(true);

        seedRefs();

        const typed = await h.automation.type('nameInput', 'Brahim');
        expect(typed.isOk()).toBe(true);

        const clicked = await h.automation.click('submitBtn');
        expect(clicked.isOk()).toBe(true);

        const result = await h.automation.extractText('resultPara');
        expect(result.isOk()).toBe(true);
        if (result.isOk()) expect(result.value).toBe('Hello, Brahim');
    });
});
