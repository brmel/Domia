import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { chromium, Browser, Page } from 'playwright';
import { z } from 'zod';
import { IAppDriver, AppCapabilities } from '../../../domain/ports/IAppDriver';
import { AppSnapshot } from '../../../domain/value-objects/AppSnapshot';
import { DOMElement } from '../../../domain/value-objects/DOMSnapshot';
import { ToolDefinition, ActionResult } from '../../../domain/tools';
import type { ILogger } from '../../../domain/ports';
import { DomScanner } from '../../perception/DomScanner';
import { SmartScrollCapture } from '../../perception/SmartScrollCapture';
import { ElementIdFactory } from '../../../domain/value-objects/Brand';
import { NavigationError } from '../../../domain/errors';
import { Platform, CDP_CONSTANTS } from '../../../domain/constants/PlatformConstants';
import { CDPValidator } from '../../../domain/validators/CDPValidator';
import { ElectronWindowManager } from './ElectronWindowManager';
import { CommonWebToolsFactory } from './CommonWebToolsFactory';

/**
 * Configuration for connecting to an Electron app
 */
export interface ElectronConnectionConfig {
    /**
     * CDP endpoint URL (e.g., 'http://localhost:9222')
     */
    readonly cdpUrl: string;

    /**
     * Optional timeout for connection in milliseconds
     * @default CDP_CONSTANTS.CONNECTION_TIMEOUT_MS (30000)
     */
    readonly connectionTimeout?: number;

    /**
     * Whether to wait for the first window to be ready
     * @default true
     */
    readonly waitForWindow?: boolean;
}

/**
 * ElectronDriver
 * 
 * Implements IAppDriver for Electron applications using Chrome DevTools Protocol (CDP).
 * Connects to Electron apps launched with --remote-debugging-port flag.
 * 
 * Key Features:
 * - CDP-based connection (no source code needed)
 * - Multi-window support
 * - Electron-specific tools (menu interaction, window management)
 * - Common web tools (click, type, scroll)
 * 
 * Usage:
 * 1. Launch Electron app with: --remote-debugging-port=9222
 * 2. Connect driver to CDP endpoint
 * 3. Agent can interact with all renderer windows
 */
@injectable()
export class ElectronDriver implements IAppDriver {
    private browser: Browser | null = null;
    private readonly windowManager: ElectronWindowManager;

    constructor(
        @inject(DomScanner) private readonly domScanner: DomScanner,
        @inject(SmartScrollCapture) private readonly screenCapture: SmartScrollCapture,
        @inject('ILogger') private readonly logger: ILogger
    ) {
        this.windowManager = new ElectronWindowManager(logger);
    }

    /**
     * Connect to an Electron application via CDP
     */
    connect(config?: ElectronConnectionConfig): ResultAsync<void, NavigationError | Error> {
        const cdpUrl = config?.cdpUrl || CDP_CONSTANTS.DEFAULT_URL;
        
        // Validate CDP URL
        const validation = CDPValidator.validateCDPUrl(cdpUrl);
        if (validation.isErr()) {
            return ResultAsync.fromPromise(
                Promise.reject(validation.error),
                (e) => new NavigationError(`Invalid CDP configuration: ${e}`)
            );
        }

        return ResultAsync.fromPromise(
            this.doConnect({ ...config, cdpUrl: validation.value }),
            (error) => {
                const message = error instanceof Error ? error.message : String(error);
                return new NavigationError(`ElectronDriver connection failed: ${message}`);
            }
        );
    }

    private async doConnect(config: ElectronConnectionConfig): Promise<void> {
        this.logger.info(`[ElectronDriver] Connecting to CDP: ${config.cdpUrl}`);

        try {
            // Connect to existing Electron instance via CDP
            this.browser = await chromium.connectOverCDP(config.cdpUrl, {
                timeout: config.connectionTimeout || CDP_CONSTANTS.CONNECTION_TIMEOUT_MS
            });

            this.logger.debug('[ElectronDriver] CDP connection established');

            // Discover all open windows (BrowserContexts)
            await this.discoverWindows();

            if (config.waitForWindow !== false && this.windowManager.getWindowCount() === 0) {
                // Wait for at least one window to appear
                await this.waitForWindow(CDP_CONSTANTS.WINDOW_WAIT_TIMEOUT_MS);
            }

            this.logger.info(`[ElectronDriver] Connected with ${this.windowManager.getWindowCount()} window(s)`);
        } catch (error) {
            this.logger.error('[ElectronDriver] Connection error:', error);
            throw error;
        }
    }

    /**
     * Disconnect from the Electron application
     */
    async disconnect(): Promise<void> {
        this.logger.info('[ElectronDriver] Disconnecting from Electron app');

        this.windowManager.clear();

        if (this.browser) {
            await this.browser.close().catch(err => {
                this.logger.warn(`[ElectronDriver] Error closing browser: ${err}`);
            });
            this.browser = null;
        }
    }

    /**
     * Get driver capabilities
     */
    getCapabilities(): AppCapabilities {
        return {
            platform: Platform.ELECTRON,
            supportsDOM: true,
            supportsVision: true,
            supportsMultiWindow: true,
            supportsNativeInteraction: true // Electron has native menus, dialogs, etc.
        };
    }

    /**
     * Capture snapshot of the active window
     */
    async captureSnapshot(): Promise<AppSnapshot> {
        const activeWindow = this.windowManager.getActiveWindow();
        if (!activeWindow) {
            throw new Error('[ElectronDriver] No active window available for snapshot');
        }

        // Scan DOM and capture screenshots
        const [rawElements, screenshots] = await Promise.all([
            this.domScanner.scan(activeWindow.page),
            this.screenCapture.capture(activeWindow.page, 1)
        ]);

        // Transform elements
        const elements: DOMElement[] = rawElements.map(el => ({
            id: ElementIdFactory.unsafe(el.id),
            tag: el.tag,
            role: el.role,
            text: el.text,
            attributes: el.attributes,
            isInteractive: el.isInteractive,
            boundingBox: el.boundingBox ? { ...el.boundingBox } : null
        }));

        const url = activeWindow.page.url();
        const title = await activeWindow.page.title();

        const rootElements = {
            html: {},
            body: {}
        };

        return {
            platform: Platform.ELECTRON,
            windowId: activeWindow.id,
            url,
            title,
            rootElements,
            elements,
            screenshot: screenshots.length > 0 ? screenshots[0]?.toString('base64') : undefined,
            screenshots: screenshots.map(b => b.toString('base64')),
            timestamp: new Date()
        };
    }

    /**
     * Get all available tools for Electron
     */
    getTools(): ToolDefinition[] {
        return [
            // Common web interaction tools
            ...this.getCommonTools(),
            // Electron-specific tools
            ...this.getElectronSpecificTools()
        ];
    }

    // ========== Private Helper Methods ==========

    private async discoverWindows(): Promise<void> {
        if (!this.browser) {
            throw new Error('[ElectronDriver] Browser not connected');
        }

        this.windowManager.clear();

        // Get all browser contexts (each Electron window is typically a context)
        const contexts = this.browser.contexts();

        for (const context of contexts) {
            const pages = context.pages();

            for (const page of pages) {
                const result = await this.windowManager.registerWindow(page);
                if (result.isErr()) {
                    this.logger.warn(`[ElectronDriver] Failed to register window: ${result.error.message}`);
                }
            }
        }

        this.logger.debug(`[ElectronDriver] Discovered ${this.windowManager.getWindowCount()} window(s)`);
    }

    private async waitForWindow(timeoutMs: number): Promise<void> {
        const startTime = Date.now();

        while (this.windowManager.getWindowCount() === 0 && Date.now() - startTime < timeoutMs) {
            await new Promise(resolve => setTimeout(resolve, CDP_CONSTANTS.WINDOW_POLL_INTERVAL_MS));
            await this.discoverWindows();
        }

        if (this.windowManager.getWindowCount() === 0) {
            throw new Error('[ElectronDriver] Timeout waiting for window');
        }
    }

    // ========== Common Web Tools ==========

    private getCommonTools(): ToolDefinition[] {
        return CommonWebToolsFactory.createAll(
            (windowId, action) => this.executeInWindow(windowId, action)
        );
    }

    // ========== Electron-Specific Tools ==========

    private getElectronSpecificTools(): ToolDefinition[] {
        return [
            {
                name: 'electron_menu_click',
                description: 'Click an Electron application menu item by label path (e.g., "File > Save")',
                schema: z.object({
                    menuPath: z.string()
                }),
                execute: (params: { menuPath: string }) => {
                    // Validate menu path
                    const validation = CDPValidator.validateMenuPath(params.menuPath);
                    if (validation.isErr()) {
                        return ResultAsync.fromSafePromise<ActionResult>(Promise.resolve({
                            success: false,
                            error: validation.error.message
                        }));
                    }

                    return ResultAsync.fromPromise(
                        (async (): Promise<ActionResult> => {
                            const activeWindow = this.windowManager.getActiveWindow();
                            if (!activeWindow) {
                                return { success: false, error: 'No active window' };
                            }

                            try {
                                // Execute menu click via Electron's remote API
                                // Note: This requires the Electron app to expose menu interaction
                                await activeWindow.page.evaluate((path) => {
                                    // This is a placeholder - actual implementation depends on 
                                    // how the Electron app exposes menu interaction
                                    const electron = (window as any).electron;
                                    if (electron && electron.clickMenu) {
                                        return electron.clickMenu(path);
                                    }
                                    throw new Error('Menu interaction not available');
                                }, params.menuPath);

                                return { success: true, message: `Clicked menu: ${params.menuPath}` };
                            } catch (error) {
                                const message = error instanceof Error ? error.message : String(error);
                                return { success: false, error: `Menu click failed: ${message}` };
                            }
                        })(),
                        (e) => new Error(`Menu click failed: ${e}`)
                    );
                }
            },
            {
                name: 'electron_switch_window',
                description: 'Switch to a different Electron window by title or URL',
                schema: z.object({
                    windowId: z.string().optional(),
                    title: z.string().optional(),
                    url: z.string().optional()
                }),
                execute: (params: { windowId?: string; title?: string; url?: string }) => {
                    // Validate windowId if provided
                    if (params.windowId) {
                        const validation = CDPValidator.validateWindowId(params.windowId);
                        if (validation.isErr()) {
                            return ResultAsync.fromSafePromise<ActionResult>(Promise.resolve({
                                success: false,
                                error: validation.error.message
                            }));
                        }
                    }

                    return ResultAsync.fromPromise(
                        (async (): Promise<ActionResult> => {
                            // Refresh window list
                            await this.discoverWindows();

                            let targetWindow;

                            if (params.windowId) {
                                const result = this.windowManager.getWindow(params.windowId);
                                targetWindow = result.isOk() ? result.value : undefined;
                            } else if (params.title) {
                                const result = this.windowManager.findWindow({ title: params.title });
                                if (result.isOk()) {
                                    targetWindow = result.value;
                                }
                            } else if (params.url) {
                                const result = this.windowManager.findWindow({ url: params.url });
                                if (result.isOk()) {
                                    targetWindow = result.value;
                                }
                            }

                            if (!targetWindow) {
                                const allWindows = this.windowManager.getAllWindows();
                                return {
                                    success: false,
                                    error: 'Window not found',
                                    data: { 
                                        availableWindows: allWindows.map(w => ({ 
                                            id: w.id, 
                                            title: w.title, 
                                            url: w.url 
                                        })) 
                                    }
                                };
                            }

                            const setActiveResult = this.windowManager.setActiveWindow(targetWindow.id);
                            if (setActiveResult.isErr()) {
                                return { success: false, error: setActiveResult.error.message };
                            }

                            await targetWindow.page.bringToFront();

                            return {
                                success: true,
                                message: `Switched to window: ${targetWindow.title}`,
                                data: { windowId: targetWindow.id }
                            };
                        })(),
                        (e) => new Error(`Switch window failed: ${e}`)
                    );
                }
            },
            {
                name: 'electron_list_windows',
                description: 'List all available Electron windows',
                schema: z.object({}),
                execute: () => {
                    return ResultAsync.fromPromise(
                        (async (): Promise<ActionResult> => {
                            await this.discoverWindows();

                            const allWindows = this.windowManager.getAllWindows();
                            const activeWindow = this.windowManager.getActiveWindow();

                            const windowList = allWindows.map(w => ({
                                id: w.id,
                                title: w.title,
                                url: w.url,
                                isActive: activeWindow?.id === w.id
                            }));

                            return {
                                success: true,
                                data: { windows: windowList },
                                message: `Found ${windowList.length} window(s)`
                            };
                        })(),
                        (e) => new Error(`List windows failed: ${e}`)
                    );
                }
            },
            {
                name: 'electron_get_window_state',
                description: 'Get the state of a window (position, size, visibility)',
                schema: z.object({
                    windowId: z.string().optional()
                }),
                execute: (params: { windowId?: string }) => {
                    // Validate windowId if provided
                    if (params.windowId) {
                        const validation = CDPValidator.validateWindowId(params.windowId);
                        if (validation.isErr()) {
                            return ResultAsync.fromSafePromise<ActionResult>(Promise.resolve({
                                success: false,
                                error: validation.error.message
                            }));
                        }
                    }

                    return ResultAsync.fromPromise(
                        (async (): Promise<ActionResult> => {
                            const activeWindow = this.windowManager.getActiveWindow();
                            const windowId = params.windowId || activeWindow?.id;
                            
                            if (!windowId) {
                                return { success: false, error: 'No window ID specified or active' };
                            }

                            const result = this.windowManager.getWindow(windowId);
                            if (result.isErr()) {
                                return { success: false, error: result.error.message };
                            }

                            const window = result.value;

                            try {
                                const viewportSize = window.page.viewportSize();
                                return {
                                    success: true,
                                    data: {
                                        windowId: window.id,
                                        title: window.title,
                                        url: window.url,
                                        viewport: viewportSize
                                    }
                                };
                            } catch (error) {
                                const message = error instanceof Error ? error.message : String(error);
                                return { success: false, error: `Failed to get window state: ${message}` };
                            }
                        })(),
                        (e) => new Error(`Get window state failed: ${e}`)
                    );
                }
            }
        ];
    }

    /**
     * Execute an action in a specific window context
     */
    private async executeInWindow(
        windowId: string | undefined,
        action: (page: Page) => Promise<ActionResult>
    ): Promise<ActionResult> {
        try {
            let window;
            
            if (windowId) {
                // Validate windowId
                const validation = CDPValidator.validateWindowId(windowId);
                if (validation.isErr()) {
                    return { success: false, error: validation.error.message };
                }

                const result = this.windowManager.getWindow(windowId);
                if (result.isErr()) {
                    return { success: false, error: result.error.message };
                }
                window = result.value;
            } else {
                window = this.windowManager.getActiveWindow();
                if (!window) {
                    return { success: false, error: 'No window specified or active' };
                }
            }

            return await action(window.page);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { success: false, error: message };
        }
    }
}
