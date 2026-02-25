import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { Browser, BrowserContext, Page } from 'playwright';
import type { ILogger } from '@domain/ports';
import { PlaywrightAdapter } from '@infrastructure/playwright/PlaywrightAdapter';

function createLogger(): ILogger {
    return {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };
}

function createPage(options?: { url?: string; closed?: boolean }) {
    const listeners = new Map<string, Array<() => void>>();
    const page = {
        url: vi.fn(() => options?.url ?? 'https://example.com'),
        isClosed: vi.fn(() => options?.closed ?? false),
        on: vi.fn((event: string, handler: () => void) => {
            const existing = listeners.get(event) ?? [];
            existing.push(handler);
            listeners.set(event, existing);
            return page;
        }),
        context: vi.fn(),
    } as unknown as Page;

    return {
        page,
        emit: (event: 'close' | 'crash') => {
            const handlers = listeners.get(event) ?? [];
            for (const handler of handlers) {
                handler();
            }
        }
    };
}

describe('PlaywrightAdapter lifecycle recovery', () => {
    it('recovers a closed active page from existing browser contexts', () => {
        const logger = createLogger();
        const adapter = new PlaywrightAdapter(undefined, logger);

        const closed = createPage({ url: 'about:blank', closed: true });
        const candidate = createPage({ url: 'https://app.local', closed: false });

        const context = {
            pages: vi.fn(() => [candidate.page]),
        } as unknown as BrowserContext;

        const browser = {
            contexts: vi.fn(() => [context]),
        } as unknown as Browser;

        (adapter as unknown as { page: Page | null }).page = closed.page;
        (adapter as unknown as { browser: Browser | null }).browser = browser;

        const recovered = adapter.getPage();

        expect(recovered).toBe(candidate.page);
        expect(logger.warn).toHaveBeenCalledWith(
            '[PlaywrightAdapter] Recovered active page after closure: https://app.local'
        );
    });

    it('nulls active page when close lifecycle event is emitted', () => {
        const logger = createLogger();
        const adapter = new PlaywrightAdapter(undefined, logger);

        const attached = createPage({ url: 'https://app.local', closed: false });
        const browser = {
            contexts: vi.fn(() => []),
        } as unknown as Browser;
        const context = {
            browser: vi.fn(() => browser),
        };

        (attached.page.context as unknown as ReturnType<typeof vi.fn>).mockReturnValue(context);

        adapter.setAttachedPage(attached.page);
        attached.emit('close');

        const activePage = adapter.getPage();

        expect(activePage).toBeNull();
        expect(logger.warn).toHaveBeenCalledWith('[PlaywrightAdapter] Active page closed');
    });
});
