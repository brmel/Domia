import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PlaywrightAdapter } from './PlaywrightAdapter';

describe('PlaywrightAdapter', () => {
    let adapter: PlaywrightAdapter;

    beforeAll(async () => {
        adapter = new PlaywrightAdapter();
        const result = await adapter.launch({ headless: true });
        expect(result.isOk()).toBe(true);
    });

    afterAll(async () => {
        await adapter.close();
    });

    it('should navigate to a URL', async () => {
        const result = await adapter.navigateTo('https://example.com' as never);
        expect(result.isOk()).toBe(true);
    });

    it('should take a snapshot with elements', async () => {
        await adapter.navigateTo('https://example.com' as never);
        const result = await adapter.snapshot();

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.url).toContain('example.com');
            expect(result.value.title).toBeTruthy();
            expect(result.value.elements).toBeDefined();
        }
    });

    it('should take a screenshot', async () => {
        const result = await adapter.screenshot();

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value.data).toBeInstanceOf(Buffer);
            expect(result.value.timestamp).toBeInstanceOf(Date);
        }
    });

    it('should scroll up and down', async () => {
        const downResult = await adapter.scroll('down');
        expect(downResult.isOk()).toBe(true);

        const upResult = await adapter.scroll('up');
        expect(upResult.isOk()).toBe(true);
    });
});
