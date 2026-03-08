import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Browser } from 'playwright';
import type { ILogger } from '@domain/ports';

vi.mock('playwright', () => ({
    chromium: {
        launch: vi.fn(),
    },
}));

import { BrowserPool } from '@infrastructure/playwright/BrowserPool';
import { chromium } from 'playwright';

function createLogger(): ILogger {
    return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), setLevel: vi.fn() };
}

function mockBrowser(connected = true): Browser {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    return {
        isConnected: vi.fn(() => connected),
        close: vi.fn(async () => {
            connected = false;
        }),
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
            const list = listeners.get(event) ?? [];
            list.push(handler);
            listeners.set(event, list);
        }),
        _emit(event: string) {
            for (const h of listeners.get(event) ?? []) h();
        },
    } as unknown as Browser & { _emit(e: string): void };
}

describe('BrowserPool', () => {
    let pool: BrowserPool;
    let logger: ILogger;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.mocked(chromium.launch).mockReset();
        logger = createLogger();
        pool = new BrowserPool(logger);
    });

    afterEach(async () => {
        vi.useRealTimers();
        await pool.close();
    });

    it('launches a browser on first acquire', async () => {
        const b = mockBrowser();
        vi.mocked(chromium.launch).mockResolvedValueOnce(b);

        const result = await pool.acquire(true);

        expect(result).toBe(b);
        expect(chromium.launch).toHaveBeenCalledWith({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
    });

    it('reuses warm browser on same headless mode', async () => {
        const b = mockBrowser();
        vi.mocked(chromium.launch).mockResolvedValueOnce(b);

        await pool.acquire(true);
        const second = await pool.acquire(true);

        expect(second).toBe(b);
        expect(chromium.launch).toHaveBeenCalledTimes(1);
    });

    it('closes and relaunches when headless mode changes', async () => {
        const b1 = mockBrowser();
        const b2 = mockBrowser();
        vi.mocked(chromium.launch).mockResolvedValueOnce(b1).mockResolvedValueOnce(b2);

        await pool.acquire(true);
        const result = await pool.acquire(false);

        expect(result).toBe(b2);
        expect(b1.close).toHaveBeenCalled();
        expect(chromium.launch).toHaveBeenCalledTimes(2);
    });

    it('release starts idle timer that calls close', async () => {
        const b = mockBrowser();
        vi.mocked(chromium.launch).mockResolvedValueOnce(b);

        await pool.acquire(true);
        pool.release();

        vi.advanceTimersByTime(60_000);
        await vi.runAllTimersAsync();

        expect(b.close).toHaveBeenCalled();
    });

    it('acquire cancels idle timer', async () => {
        const b = mockBrowser();
        vi.mocked(chromium.launch).mockResolvedValueOnce(b);

        await pool.acquire(true);
        pool.release();

        vi.advanceTimersByTime(30_000);
        await pool.acquire(true);
        vi.advanceTimersByTime(60_000);

        expect(b.close).not.toHaveBeenCalled();
    });

    it('close clears timer and closes browser', async () => {
        const b = mockBrowser();
        vi.mocked(chromium.launch).mockResolvedValueOnce(b);

        await pool.acquire(true);
        pool.release();
        await pool.close();

        expect(b.close).toHaveBeenCalled();
    });

    it('disconnected event nullifies pool state', async () => {
        const b = mockBrowser() as Browser & { _emit(e: string): void };
        vi.mocked(chromium.launch).mockResolvedValueOnce(b);

        await pool.acquire(true);
        b._emit('disconnected');

        const b2 = mockBrowser();
        vi.mocked(chromium.launch).mockResolvedValueOnce(b2);
        const result = await pool.acquire(true);

        expect(result).toBe(b2);
    });

    it('close is safe when no browser exists', async () => {
        await expect(pool.close()).resolves.toBeUndefined();
    });
});
