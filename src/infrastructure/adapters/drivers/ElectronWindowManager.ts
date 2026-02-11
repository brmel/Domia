import { Page } from 'playwright';
import { Result, ok, err } from 'neverthrow';
import type { ILogger } from '../../../domain/ports';
import { CDPValidator, ValidationError } from '../../../domain/validators/CDPValidator';
import { WINDOW_ID_CONSTANTS } from '../../../domain/constants/PlatformConstants';

/**
 * Represents an Electron window (renderer process)
 */
export interface ElectronWindow {
    readonly id: string;
    readonly page: Page;
    readonly title: string;
    readonly url: string;
}

/**
 * Window selection criteria
 */
export interface WindowSelector {
    readonly windowId?: string;
    readonly title?: string;
    readonly url?: string;
}

/**
 * ElectronWindowManager
 * 
 * Manages Electron application windows with improved organization and error handling.
 * Follows Single Responsibility Principle - only handles window management.
 */
export class ElectronWindowManager {
    private windows: Map<string, ElectronWindow> = new Map();
    private activeWindowId: string | null = null;
    private windowIdCounter = 0;

    constructor(private readonly logger: ILogger) { }

    /**
     * Register a new window
     * 
     * @param page - Playwright Page representing the window
     * @returns Result with window ID or error
     */
    async registerWindow(page: Page): Promise<Result<string, Error>> {
        try {
            const windowId = this.generateWindowId();
            const title = await page.title().catch(() => 'Untitled');
            const url = page.url();

            this.windows.set(windowId, {
                id: windowId,
                page,
                title,
                url
            });

            // Set as active if it's the first window
            if (!this.activeWindowId) {
                this.activeWindowId = windowId;
            }

            this.logger.debug(`[WindowManager] Registered window: ${windowId} - ${title}`);

            return ok(windowId);
        } catch (error) {
            return err(new Error(`Failed to register window: ${error}`));
        }
    }

    /**
     * Unregister a window
     * 
     * @param windowId - ID of window to unregister
     * @returns Result indicating success or failure
     */
    unregisterWindow(windowId: string): Result<void, ValidationError> {
        const validation = CDPValidator.validateWindowId(windowId);
        if (validation.isErr()) {
            return err(validation.error);
        }

        if (!this.windows.has(windowId)) {
            return err(new ValidationError(
                `Window ${windowId} not found`,
                'windowId',
                windowId
            ));
        }

        this.windows.delete(windowId);

        // Clear active if it was the active window
        if (this.activeWindowId === windowId) {
            const keys = Array.from(this.windows.keys());
            this.activeWindowId = keys.length > 0 ? keys[0]! : null;
        }

        this.logger.debug(`[WindowManager] Unregistered window: ${windowId}`);

        return ok(undefined);
    }

    /**
     * Get a window by ID
     * 
     * @param windowId - Window ID
     * @returns Result with window or error
     */
    getWindow(windowId: string): Result<ElectronWindow, ValidationError> {
        const validation = CDPValidator.validateWindowId(windowId);
        if (validation.isErr()) {
            return err(validation.error);
        }

        const window = this.windows.get(windowId);
        if (!window) {
            return err(new ValidationError(
                `Window ${windowId} not found`,
                'windowId',
                windowId
            ));
        }

        return ok(window);
    }

    /**
     * Get the active window
     * 
     * @returns Active window or null if none
     */
    getActiveWindow(): ElectronWindow | null {
        if (!this.activeWindowId) {
            // Try to set first available window as active
            const firstWindow =Array.from(this.windows.values())[0];
            if (firstWindow) {
                this.activeWindowId = firstWindow.id;
                return firstWindow;
            }
            return null;
        }

        return this.windows.get(this.activeWindowId) || null;
    }

    /**
     * Set active window
     * 
     * @param windowId - ID of window to make active
     * @returns Result indicating success or failure
     */
    setActiveWindow(windowId: string): Result<void, ValidationError> {
        const validation = CDPValidator.validateWindowId(windowId);
        if (validation.isErr()) {
            return err(validation.error);
        }

        if (!this.windows.has(windowId)) {
            return err(new ValidationError(
                `Window ${windowId} not found`,
                'windowId',
                windowId
            ));
        }

        this.activeWindowId = windowId;
        this.logger.debug(`[WindowManager] Active window set to: ${windowId}`);

        return ok(undefined);
    }

    /**
     * Find window by criteria
     * 
     * @param selector - Window selection criteria
     * @returns Result with found window or error
     */
    findWindow(selector: WindowSelector): Result<ElectronWindow, Error> {
        if (selector.windowId) {
            return this.getWindow(selector.windowId);
        }

        const windows = Array.from(this.windows.values());

        if (selector.title) {
            const window = windows.find(w => w.title.includes(selector.title!));
            if (window) {
                return ok(window);
            }
        }

        if (selector.url) {
            const window = windows.find(w => w.url.includes(selector.url!));
            if (window) {
                return ok(window);
            }
        }

        return err(new Error('No window found matching criteria'));
    }

    /**
     * Get all windows
     * 
     * @returns Array of all registered windows
     */
    getAllWindows(): ElectronWindow[] {
        return Array.from(this.windows.values());
    }

    /**
     * Get window count
     * 
     * @returns Number of registered windows
     */
    getWindowCount(): number {
        return this.windows.size;
    }

    /**
     * Clear all windows
     */
    clear(): void {
        this.windows.clear();
        this.activeWindowId = null;
        this.windowIdCounter = 0;
        this.logger.debug('[WindowManager] Cleared all windows');
    }

    /**
     * Generate a unique window ID
     * 
     * @returns Unique window ID
     */
    private generateWindowId(): string {
        // Use counter for uniqueness instead of timestamp
        const id = `${WINDOW_ID_CONSTANTS.PREFIX}${WINDOW_ID_CONSTANTS.SEPARATOR}${this.windowIdCounter++}`;
        return id;
    }
}
