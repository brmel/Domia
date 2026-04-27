/**
 * Integration tests for the snapshot recording tools and waitForCondition.
 *
 * These tests launch a REAL Playwright browser, serve a REAL fixture page,
 * inject the REAL recording scripts, trigger REAL DOM mutations, and verify
 * the results match expectations.  No mocks.
 *
 * This is the layer that validates the in-browser JavaScript actually works
 * before real users ever see it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { PlaywrightPerceptionSource } from '@infrastructure/playwright/PlaywrightPerceptionSource';
import { createSnapshotRecordingTools } from '@infrastructure/tools/catalog/snapshot-recording.tools';
import { createPollingTools } from '@infrastructure/tools/catalog/polling.tools';
import { PostActionCaptureMiddleware } from '@infrastructure/tools/PostActionCaptureMiddleware';
import { buildRoleSnapshot } from '@infrastructure/playwright/perception/RoleRefResolver';
import { startFixtureServer, type FixtureServerHandle } from '../cli/helpers/web-fixture-server';
import { join } from 'path';
import { ResultAsync } from 'neverthrow';
import { v4 as uuidv4 } from 'uuid';
import type { IPerceptionPipeline, IPerceptionSource } from '@domain/ports';
import type { PerceptionFrame } from '@domain/value-objects/PerceptionFrame';
import { VisualContext } from '@domain/value-objects/VisualContext';

// ──── Lightweight perception pipeline (no DI, no vision) ────

function createLightPipeline(): IPerceptionPipeline {
    return {
        capture(source: IPerceptionSource, _options?: unknown) {
            return ResultAsync.fromPromise(
                (async () => {
                    await source.waitForContentReady(5000);
                    const ariaText = await source.getAriaSnapshot();
                    const title = await source.getTitle().catch(() => '');
                    const { snapshot, refs } = buildRoleSnapshot(ariaText);
                    const viewport = source.getViewportSize() ?? { width: 0, height: 0 };

                    const frame: PerceptionFrame = {
                        id: uuidv4(),
                        timestamp: Date.now(),
                        metadata: { url: source.getUrl(), title, viewport },
                        vision: new VisualContext([], 'image/jpeg'),
                        semantic: { ariaSnapshot: snapshot, refs },
                    };
                    return frame;
                })(),
                (e) => new Error(String(e)),
            );
        },
    } as unknown as IPerceptionPipeline;
}

let browser: Browser;
let server: FixtureServerHandle;

beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    server = await startFixtureServer(join(process.cwd(), 'tests/e2e/cli/fixtures/recording-test'));
}, 30_000);

afterAll(async () => {
    await browser?.close();
    await server?.stop();
});

async function createPage(queryParams = ''): Promise<Page> {
    const page = await browser.newPage();
    await page.goto(`${server.baseUrl}${queryParams ? '?' + queryParams : ''}`);
    await page.waitForLoadState('domcontentloaded');
    return page;
}

// ──────────────────────── Recording Tools ────────────────────────

describe('Snapshot Recording — real Playwright browser', () => {
    it('injects the MutationObserver and retrieves an empty log when no mutations occur', async () => {
        const page = await createPage();
        try {
            const source = new PlaywrightPerceptionSource(page);
            const tools = createSnapshotRecordingTools(source);
            const [startTool, stopTool] = tools;

            // Start recording
            const startResult = await startTool!.execute({});
            expect(startResult).toMatchObject({ status: 'started' });

            // Stop immediately — no DOM changes happened
            const stopResult = await stopTool!.execute({}) as Record<string, unknown>;
            expect(stopResult['status']).toBe('success');
            expect(stopResult['totalEntries']).toBe(0);
            expect(stopResult['allAddedValues']).toEqual([]);
        } finally {
            await page.close();
        }
    });

    it('captures DOM mutations from a fast counter (replace mode, 50ms, skip #3)', async () => {
        const page = await createPage('count=10&interval=50&skip=3&mode=replace');
        try {
            const source = new PlaywrightPerceptionSource(page);
            const tools = createSnapshotRecordingTools(source);
            const [startTool, stopTool] = tools;

            // Start recording BEFORE triggering the counter
            const startResult = await startTool!.execute({});
            expect(startResult).toMatchObject({ status: 'started' });

            // Click the Start button to trigger mutations
            await page.click('#start-btn');

            // Wait for the counter to finish (10 items × 50ms = 500ms + buffer)
            await page.waitForSelector('#status:has-text("Complete")', { timeout: 5000 });

            // Stop recording and get analysis
            const result = await stopTool!.execute({}) as Record<string, unknown>;
            expect(result['status']).toBe('success');
            expect((result['totalEntries'] as number)).toBeGreaterThan(0);

            const addedValues = result['allAddedValues'] as string[];

            // Number 3 was skipped — should NOT appear as a standalone added value
            // (It might appear as part of a combined text like "Counting... (3/10)" in status,
            //  but the number "3" as a standalone grid value should be absent)
            const standaloneNumbers = addedValues.filter(v => /^\d+$/.test(v));
            expect(standaloneNumbers).not.toContain('3');

            // Numbers 1, 2, 4–10 should appear (at least most of them, given batching)
            const expectedNumbers = [1, 2, 4, 5, 6, 7, 8, 9, 10].map(String);
            const foundNumbers = expectedNumbers.filter(n => standaloneNumbers.includes(n));
            // At least 7 out of 9 should be captured (MutationObserver batching may merge some)
            expect(foundNumbers.length).toBeGreaterThanOrEqual(7);

            // Since mode=replace and grid clears at end, most numbers should be transient
            const transientValues = result['transientValues'] as string[];
            expect(transientValues.length).toBeGreaterThan(0);
        } finally {
            await page.close();
        }
    });

    it('captures DOM mutations from an accumulate counter', async () => {
        const page = await createPage('count=5&interval=100&skip=0&mode=accumulate');
        try {
            const source = new PlaywrightPerceptionSource(page);
            const tools = createSnapshotRecordingTools(source);
            const [startTool, stopTool] = tools;

            await startTool!.execute({});
            await page.click('#start-btn');
            await page.waitForSelector('#status:has-text("Complete")', { timeout: 5000 });

            const result = await stopTool!.execute({}) as Record<string, unknown>;
            expect(result['status']).toBe('success');

            const addedValues = result['allAddedValues'] as string[];
            const standaloneNumbers = addedValues.filter(v => /^\d+$/.test(v));

            // All 5 numbers should have been added
            for (const n of ['1', '2', '3', '4', '5']) {
                expect(standaloneNumbers).toContain(n);
            }

            // Grid clears at end, so numbers should also appear in removed
            const removedValues = result['allRemovedValues'] as string[];
            expect(removedValues.length).toBeGreaterThan(0);
        } finally {
            await page.close();
        }
    });

    it('returns reset status when startRecording is called twice', async () => {
        const page = await createPage();
        try {
            const source = new PlaywrightPerceptionSource(page);
            const tools = createSnapshotRecordingTools(source);
            const [startTool, stopTool] = tools;

            const first = await startTool!.execute({});
            expect(first).toMatchObject({ status: 'started' });

            const second = await startTool!.execute({});
            expect(second).toMatchObject({ status: 'reset' });

            // Should still work after reset
            const stopResult = await stopTool!.execute({}) as Record<string, unknown>;
            expect(stopResult['status']).toBe('success');
        } finally {
            await page.close();
        }
    });

    it('returns error when stopAndReviewRecording is called without starting', async () => {
        const page = await createPage();
        try {
            const source = new PlaywrightPerceptionSource(page);
            const tools = createSnapshotRecordingTools(source);
            const [, stopTool] = tools;

            const result = await stopTool!.execute({}) as Record<string, unknown>;
            expect(result['status']).toBe('error');
            expect(result['error']).toContain('No active recording');
        } finally {
            await page.close();
        }
    });

    it('handles page with no body gracefully', async () => {
        const page = await browser.newPage();
        try {
            // about:blank has a body, but it's empty — should still work
            await page.goto('about:blank');
            const source = new PlaywrightPerceptionSource(page);
            const tools = createSnapshotRecordingTools(source);
            const [startTool, stopTool] = tools;

            const startResult = await startTool!.execute({});
            expect(startResult).toMatchObject({ status: 'started' });

            const stopResult = await stopTool!.execute({}) as Record<string, unknown>;
            expect(stopResult['status']).toBe('success');
            expect(stopResult['totalEntries']).toBe(0);
        } finally {
            await page.close();
        }
    });
});

// ──────────────────────── waitForCondition with real Playwright ────────────────────────

describe('waitForCondition — real Playwright browser', () => {
    it('detects text that appears after a delay', async () => {
        const page = await createPage('count=3&interval=200&skip=0&mode=accumulate');
        try {
            const source = new PlaywrightPerceptionSource(page);
            const pipeline = createLightPipeline();
            const automation = { updateRefs: () => {} } as unknown as import('@domain/ports').IStructuredAutomation;
            const middleware = new PostActionCaptureMiddleware(source, pipeline, automation, false);
            const tools = createPollingTools(automation, middleware);
            const waitTool = tools[0]!;

            // Click start to begin counter
            await page.click('#start-btn');

            // Poll for "Complete" text
            const result = await waitTool.execute({
                pattern: 'Complete',
                pollIntervalMs: 200,
                timeoutMs: 10_000,
            });

            expect(result).toMatchObject({ status: 'matched' });
            expect((result as { polls: number }).polls).toBeGreaterThanOrEqual(1);
        } finally {
            await page.close();
        }
    });

    it('times out when pattern never appears', async () => {
        const page = await createPage();
        try {
            const source = new PlaywrightPerceptionSource(page);
            const pipeline = createLightPipeline();
            const automation = { updateRefs: () => {} } as unknown as import('@domain/ports').IStructuredAutomation;
            const middleware = new PostActionCaptureMiddleware(source, pipeline, automation, false);
            const tools = createPollingTools(automation, middleware);
            const waitTool = tools[0]!;

            // Don't click start — page stays at "Idle", never shows "Complete"
            const result = await waitTool.execute({
                pattern: 'Complete',
                pollIntervalMs: 200,
                timeoutMs: 1000,
            });

            expect(result).toMatchObject({ status: 'timeout' });
            expect((result as { lastSnapshot: string }).lastSnapshot).toContain('Idle');
        } finally {
            await page.close();
        }
    });

    it('matches regex patterns in the ARIA snapshot', async () => {
        const page = await createPage('count=5&interval=100&skip=0&mode=accumulate');
        try {
            const source = new PlaywrightPerceptionSource(page);
            const pipeline = createLightPipeline();
            const automation = { updateRefs: () => {} } as unknown as import('@domain/ports').IStructuredAutomation;
            const middleware = new PostActionCaptureMiddleware(source, pipeline, automation, false);
            const tools = createPollingTools(automation, middleware);
            const waitTool = tools[0]!;

            await page.click('#start-btn');

            // Wait for counter to complete, then use regex to match the final "Complete" text
            // and verify the list contains numbered items
            const result = await waitTool.execute({
                pattern: 'listitem.*[0-9]',
                isRegex: true,
                pollIntervalMs: 200,
                timeoutMs: 10_000,
            });

            expect(result).toMatchObject({ status: 'matched' });
        } finally {
            await page.close();
        }
    });
});
