import type { BrowserContext, Page } from 'playwright';
import type { ITabManager, TabInfo } from '@domain/ports/ITabManager';
import { NAVIGATION_TIMEOUT_MS } from '@shared/defaults';

const BROWSER_NOT_LAUNCHED = 'Browser not launched';

export interface TabHost {
    context(): BrowserContext | null;
    activePage(): Page | null;
    setActivePage(page: Page | null): void;
    attachLifecycle(page: Page): void;
    waitForReady(): Promise<void>;
}

export class PlaywrightTabs implements ITabManager {
    constructor(private readonly host: TabHost) {}

    async newTab(url?: string): Promise<TabInfo> {
        const context = this.host.context();
        if (!context) throw new Error(BROWSER_NOT_LAUNCHED);
        const newPage = await context.newPage();
        this.host.setActivePage(newPage);
        this.host.attachLifecycle(newPage);
        if (url) {
            await newPage.goto(url, { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS });
            await this.host.waitForReady();
        }
        const tabs = await this.listTabs();
        return tabs.find((t) => t.active) ?? tabs[tabs.length - 1]!;
    }

    async listTabs(): Promise<TabInfo[]> {
        const context = this.host.context();
        if (!context) return [];
        const pages = context.pages().filter((p) => !p.isClosed());
        const currentPage = this.host.activePage();
        return Promise.all(
            pages.map(async (p, i) => ({
                index: i,
                url: p.url(),
                title: await p.title(),
                active: p === currentPage,
            }))
        );
    }

    async switchTab(index: number): Promise<TabInfo> {
        const context = this.host.context();
        if (!context) throw new Error(BROWSER_NOT_LAUNCHED);
        const pages = context.pages().filter((p) => !p.isClosed());
        const target = pages[index];
        if (!target) throw new Error(`Tab index ${index} out of range (${pages.length} tabs open)`);
        this.host.setActivePage(target);
        await target.bringToFront();
        return { index, url: target.url(), title: await target.title(), active: true };
    }

    async closeTab(index?: number): Promise<void> {
        const context = this.host.context();
        if (!context) throw new Error(BROWSER_NOT_LAUNCHED);
        const pages = context.pages().filter((p) => !p.isClosed());
        const target = index !== undefined ? pages[index] : this.host.activePage();
        if (!target) return;
        await target.close();
        const remaining = context.pages().filter((p) => !p.isClosed());
        this.host.setActivePage(remaining[remaining.length - 1] ?? null);
    }
}
