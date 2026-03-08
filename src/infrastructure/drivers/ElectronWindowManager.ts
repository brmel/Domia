import type { Page } from 'playwright';
import { Result, ok, err } from 'neverthrow';
import type { ILogger } from '@domain/ports';
import { CDPValidator } from '@domain/CDPValidator';
import { ValidationError } from '@domain/errors';
import type { PlaywrightAdapter } from '../playwright/PlaywrightAdapter';

export interface ElectronWindow {
    readonly id: string;
    /** @internal — only accessed within infrastructure layer */
    readonly page: Page;
    readonly title: string;
    readonly url: string;
}

export class ElectronWindowManager {
    private static readonly TAG = '[ElectronWindowManager]';

    private windows = new Map<string, ElectronWindow>();
    private activeWindowId: string | null = null;
    private windowIdCounter = 0;

    constructor(private readonly logger: ILogger) {}

    async registerWindow(page: Page): Promise<Result<string, Error>> {
        try {
            const windowId = this.generateWindowId();
            const title = await page.title().catch(() => 'Untitled');
            const url = page.url();

            this.windows.set(windowId, { id: windowId, page, title, url });

            if (!this.activeWindowId) {
                this.activeWindowId = windowId;
            }

            this.logger.debug(`${ElectronWindowManager.TAG} Registered: ${windowId} — ${title}`);
            return ok(windowId);
        } catch (error) {
            return err(new Error(`Failed to register window: ${error}`));
        }
    }

    getWindow(windowId: string): Result<ElectronWindow, ValidationError> {
        const validation = CDPValidator.validateWindowId(windowId);
        if (validation.isErr()) return err(validation.error);

        const window = this.windows.get(windowId);
        if (!window) {
            return err(new ValidationError(`Window ${windowId} not found`, 'windowId'));
        }
        return ok(window);
    }

    getActiveWindow(): ElectronWindow | null {
        if (!this.activeWindowId) {
            const firstWindow = Array.from(this.windows.values())[0];
            if (firstWindow) {
                this.activeWindowId = firstWindow.id;
                return firstWindow;
            }
            return null;
        }
        return this.windows.get(this.activeWindowId) ?? null;
    }

    setActiveWindow(windowId: string): Result<void, ValidationError> {
        const validation = CDPValidator.validateWindowId(windowId);
        if (validation.isErr()) return err(validation.error);

        if (!this.windows.has(windowId)) {
            return err(new ValidationError(`Window ${windowId} not found`, 'windowId'));
        }

        this.activeWindowId = windowId;
        this.logger.debug(`${ElectronWindowManager.TAG} Active window: ${windowId}`);
        return ok(undefined);
    }

    findWindowByTitle(title: string): Result<ElectronWindow, Error> {
        const w = Array.from(this.windows.values()).find((win) => win.title.includes(title));
        return w ? ok(w) : err(new Error(`No window found matching title '${title}'`));
    }

    /**
     * Switch to window, bring it to front, and attach the page to the adapter.
     * Consolidates logic previously duplicated in electron.tools.ts, ElectronDriver, and ElectronWindowSelectionPolicy.
     */
    async switchWindow(windowId: string, adapter?: PlaywrightAdapter): Promise<Result<ElectronWindow, ValidationError>> {
        const setResult = this.setActiveWindow(windowId);
        if (setResult.isErr()) return err(setResult.error);

        const win = this.windows.get(windowId)!;
        await win.page.bringToFront().catch(() => undefined);

        if (adapter) {
            adapter.setAttachedPage(win.page);
        }

        this.logger.info(`${ElectronWindowManager.TAG} Switched to window '${win.title}' (${windowId})`);
        return ok(win);
    }

    getAllWindows(): ElectronWindow[] {
        return Array.from(this.windows.values());
    }

    getWindowCount(): number {
        return this.windows.size;
    }

    reset(): void {
        this.windows.clear();
        this.activeWindowId = null;
        this.windowIdCounter = 0;
        this.logger.debug(`${ElectronWindowManager.TAG} Reset`);
    }

    private generateWindowId(): string {
        return `electron-window-${this.windowIdCounter++}`;
    }
}
