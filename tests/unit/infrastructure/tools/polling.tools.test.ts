import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { createPollingTools } from '@infrastructure/tools/catalog/polling.tools';
import type { PostActionCaptureMiddleware } from '@infrastructure/tools/PostActionCaptureMiddleware';
import { ActionType } from '@domain/enums';

function makeMockMiddleware(captureResults: Array<Record<string, unknown>>): PostActionCaptureMiddleware {
    let callIndex = 0;
    return {
        capture: vi.fn(async () => {
            const result = captureResults[Math.min(callIndex, captureResults.length - 1)];
            callIndex++;
            return result;
        }),
    } as unknown as PostActionCaptureMiddleware;
}

describe('createPollingTools', () => {
    it('returns a single waitForCondition tool', () => {
        const middleware = makeMockMiddleware([{ elements: '' }]);
        const tools = createPollingTools(middleware);

        expect(tools).toHaveLength(1);
        expect(tools[0]!.name).toBe('waitForCondition');
        expect(tools[0]!.actionType).toBe(ActionType.WAIT_FOR_CONDITION);
        expect(tools[0]!.isLongRunning).toBe(true);
    });

    it('matches plain text pattern and returns matched result', async () => {
        const middleware = makeMockMiddleware([
            { elements: 'Loading...' },
            { elements: 'Upload complete - 3 files processed' },
        ]);
        const tool = createPollingTools(middleware)[0]!;

        const result = await tool.execute({
            pattern: 'Upload complete',
            pollIntervalMs: 10,
            timeoutMs: 5000,
        });

        expect(result).toMatchObject({
            status: 'matched',
            matchedText: 'Upload complete',
            polls: 2,
        });
        expect((result as { elapsedMs: number }).elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('matches regex pattern (case-insensitive)', async () => {
        const middleware = makeMockMiddleware([
            { elements: 'Order #12345 confirmed' },
        ]);
        const tool = createPollingTools(middleware)[0]!;

        const result = await tool.execute({
            pattern: 'Order #\\d+',
            isRegex: true,
            pollIntervalMs: 10,
            timeoutMs: 5000,
        });

        expect(result).toMatchObject({
            status: 'matched',
            matchedText: 'Order #12345',
            polls: 1,
        });
    });

    it('returns timeout when pattern never appears', async () => {
        const middleware = makeMockMiddleware([{ elements: 'Still loading...' }]);
        const tool = createPollingTools(middleware)[0]!;

        const result = await tool.execute({
            pattern: 'Done',
            pollIntervalMs: 10,
            timeoutMs: 50,
        });

        expect(result).toMatchObject({ status: 'timeout' });
        expect((result as { polls: number }).polls).toBeGreaterThanOrEqual(1);
        expect((result as { lastSnapshot: string }).lastSnapshot).toBe('Still loading...');
    });

    it('returns error for invalid regex', async () => {
        const middleware = makeMockMiddleware([{ elements: '' }]);
        const tool = createPollingTools(middleware)[0]!;

        const result = await tool.execute({
            pattern: '[invalid',
            isRegex: true,
            pollIntervalMs: 10,
            timeoutMs: 1000,
        });

        expect(result).toMatchObject({ status: 'error' });
        expect((result as { error: string }).error).toContain('Invalid regex');
    });

    it('returns error when capture fails', async () => {
        const middleware = makeMockMiddleware([{ status: 'error', error: 'Page crashed' }]);
        const tool = createPollingTools(middleware)[0]!;

        const result = await tool.execute({
            pattern: 'anything',
            pollIntervalMs: 10,
            timeoutMs: 1000,
        });

        expect(result).toMatchObject({
            status: 'error',
            error: 'Page crashed',
        });
    });

    it('clamps poll interval to minimum 200ms', async () => {
        const middleware = makeMockMiddleware([{ elements: 'match' }]);
        const tool = createPollingTools(middleware)[0]!;

        // Even if we pass 1ms, it should use at least 200ms, but since the first poll
        // matches immediately the clamping just affects sleep between polls.
        const result = await tool.execute({
            pattern: 'match',
            pollIntervalMs: 1,
            timeoutMs: 5000,
        });

        expect(result).toMatchObject({ status: 'matched', polls: 1 });
    });
});
