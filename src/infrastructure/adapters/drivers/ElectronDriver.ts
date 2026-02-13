import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { spawn, ChildProcess } from 'child_process';
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
import { ElectronWindowSelectionPolicy } from './ElectronWindowSelectionPolicy';
import { PlatformType, ToolScope } from '@domain/tools/ToolMetadata';
import { PlaywrightAdapter } from '../browser/PlaywrightAdapter';
import { IBrowserAutomation } from '../../../domain/ports';
import { okAsync } from 'neverthrow';
import { retryAsync } from '@shared/reliability/retry';
import { RETRY_PROFILES, isTransientElectronConnectError } from '@shared/reliability/retryProfiles';

export interface ElectronConnectionConfig {
    readonly cdpUrl?: string;
    readonly executablePath?: string;
    readonly launchArgs?: string[];
    readonly connectionTimeout?: number;
    readonly waitForWindow?: boolean;
    readonly windowTitle?: string;
}

@injectable()
export class ElectronDriver implements IAppDriver {
    private browser: Browser | null = null;
    private appProcess: ChildProcess | null = null;
    private readonly windowManager: ElectronWindowManager;

    constructor(
        @inject(DomScanner) private readonly domScanner: DomScanner,
        @inject(SmartScrollCapture) private readonly screenCapture: SmartScrollCapture,
        @inject(ElectronWindowSelectionPolicy) private readonly windowSelectionPolicy: ElectronWindowSelectionPolicy,
        @inject('ILogger') private readonly logger: ILogger
    ) {
        this.windowManager = new ElectronWindowManager(logger);
    }

    connect(config?: ElectronConnectionConfig): ResultAsync<void, NavigationError | Error> {
        if(config?.executablePath) {
            return ResultAsync.fromPromise(
                this.doLaunch(config),
                (error) => {
                    const message = error instanceof Error ? error.message : String(error);
                    return new NavigationError(`ElectronDriver launch failed: ${message}`);
                }
            );
        }
        
        const cdpUrl = config?.cdpUrl || CDP_CONSTANTS.DEFAULT_URL;
        
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
            this.browser = await retryAsync(
                async () => chromium.connectOverCDP(config.cdpUrl!, {
                    timeout: config.connectionTimeout || CDP_CONSTANTS.CONNECTION_TIMEOUT_MS
                }),
                {
                    ...RETRY_PROFILES.electronCdpConnect,
                    shouldRetry: (error) => isTransientElectronConnectError(error),
                    onRetry: (info) => {
                        const message = info.error instanceof Error ? info.error.message : String(info.error);
                        this.logger.warn(
                            `[ElectronDriver] Retry ${info.attempt}/${info.maxAttempts - 1} CDP connect after error: ${message}`
                        );
                    }
                }
            );

            this.logger.debug('[ElectronDriver] CDP connection established');
            await this.discoverWindows();

            if (config.waitForWindow !== false && this.windowManager.getWindowCount() === 0) {
                await this.waitForWindow(CDP_CONSTANTS.WINDOW_WAIT_TIMEOUT_MS);
            }

            await this.windowSelectionPolicy.selectTargetWindow(this.windowManager, config.windowTitle);

            this.logger.info(`[ElectronDriver] Connected with ${this.windowManager.getWindowCount()} window(s)`);
        } catch (error) {
            this.logger.error('[ElectronDriver] Connection error:', error);
            throw error;
        }
    }
    
    private async doLaunch(config: ElectronConnectionConfig): Promise<void> {
        this.logger.info(`[ElectronDriver] Launching Electron app: ${config.executablePath}`);
        this.logger.info(`[ElectronDriver] Env Port: ${process.env['ELECTRON_REMOTE_DEBUGGING_PORT']}`);

        try {
            const port = process.env['ELECTRON_REMOTE_DEBUGGING_PORT'];

            if (port) {
                this.logger.info(`[ElectronDriver] Spawning process manually with port ${port}`);

                // CRITICAL: process.env contains ELECTRON_RUN_AS_NODE=1 because the CLI runs via electron.
                // We MUST remove this when spawning the actual packaged app, otherwise it runs as Node
                // and fails to launch the app logic/CDP server.
                const env = { ...process.env };
                delete env['ELECTRON_RUN_AS_NODE'];
                // Packaged Electron apps reject NODE_OPTIONS and emit a startup warning.
                // Remove only this known incompatible variable; keep all other stderr warnings visible.
                delete env['NODE_OPTIONS'];

                this.appProcess = spawn(config.executablePath!, config.launchArgs || [], {
                    env, 
                    detached: false,
                    stdio: 'pipe'
                });

                this.logger.info(`[ElectronDriver] Process spawned with PID: ${this.appProcess.pid}`);

                this.appProcess.stdout?.on('data', (data) => {
                    this.logger.info(`[Electron App] ${data.toString()}`);
                });
                
                this.appProcess.stderr?.on('data', (data) => {
                    this.logger.warn(`[Electron App Err] ${data.toString()}`);
                });

                const cdpUrl = `http://127.0.0.1:${port}`;
                try {
                    this.browser = await retryAsync(
                        async () => chromium.connectOverCDP(cdpUrl, {
                            timeout: config.connectionTimeout || 5000
                        }),
                        {
                            ...RETRY_PROFILES.electronExecutableConnect,
                            shouldRetry: (error) => isTransientElectronConnectError(error),
                            onRetry: (info) => {
                                const message = info.error instanceof Error ? info.error.message : String(info.error);
                                this.logger.debug(
                                    `[ElectronDriver] Waiting for executable CDP (${info.attempt}/${info.maxAttempts - 1}): ${message}`
                                );
                            }
                        }
                    );
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    throw new Error(`Failed to connect to manually spawned Electron app after retries: ${message}`);
                }
            } else {
                // When launching a packaged Electron app, we must ignore default Chrome arguments
                // as they might cause the app to crash or reject the flags.
                // We ensure remote debugging is enabled.
                const defaultArgs = ['--remote-debugging-port=9222'];

                const args = [
                    ...(config.launchArgs || []),
                    // Only add default port if not already provided
                    ...(config.launchArgs?.some(a => a.includes('remote-debugging-port')) ? [] : defaultArgs)
                ];

                this.browser = await chromium.launch({
                    executablePath: config.executablePath!,
                    args,
                    timeout: config.connectionTimeout || CDP_CONSTANTS.CONNECTION_TIMEOUT_MS,
                    ignoreDefaultArgs: true
                });
            }

            this.logger.debug('[ElectronDriver] App launched successfully');
            await this.discoverWindows();

            if (config.waitForWindow !== false && this.windowManager.getWindowCount() === 0) {
                await this.waitForWindow(CDP_CONSTANTS.WINDOW_WAIT_TIMEOUT_MS);
            }

            await this.windowSelectionPolicy.selectTargetWindow(this.windowManager, config.windowTitle);

            this.logger.info(`[ElectronDriver] Launched with ${this.windowManager.getWindowCount()} window(s)`);
        } catch (error) {
            this.logger.error('[ElectronDriver] Launch error:', error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        this.logger.info('[ElectronDriver] Disconnecting from Electron app');

        this.windowManager.clear();

        if (this.browser) {
            await this.browser.close().catch(err => {
                this.logger.warn(`[ElectronDriver] Error closing browser: ${err}`);
            });
            this.browser = null;
        }

        if (this.appProcess) {
            this.logger.info('[ElectronDriver] Killing spawned app process');
            this.appProcess.kill();
            this.appProcess = null;
        }
    }

    getCapabilities(): AppCapabilities {
        return {
            platform: Platform.ELECTRON,
            supportsDOM: true,
            supportsVision: true,
            supportsMultiWindow: true,
            supportsNativeInteraction: true // Electron has native menus, dialogs, etc.
        };
    }

    async captureSnapshot(): Promise<AppSnapshot> {
        const activeWindow = this.windowManager.getActiveWindow();
        if (!activeWindow) {
            throw new Error('[ElectronDriver] No active window available for snapshot');
        }

        const [rawElements, screenshots] = await Promise.all([
            this.domScanner.scan(activeWindow.page),
            this.screenCapture.capture(activeWindow.page, 1)
        ]);

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

    getTools(): ToolDefinition[] {
        return [
            ...this.getCommonTools(),
            ...this.getElectronSpecificTools()
        ];
    }

    private async discoverWindows(): Promise<void> {
        if (!this.browser) {
            throw new Error('[ElectronDriver] Browser not connected');
        }

        this.windowManager.clear();

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

    private getCommonTools(): ToolDefinition[] {
        const tools = CommonWebToolsFactory.createAll(
            (windowId: string | undefined, action: (page: any) => Promise<ActionResult>) => 
                this.executeInWindow(windowId, action)
        );
        return tools.map((tool: ToolDefinition) => ({
            ...tool,
            metadata: {
                ...tool.metadata,
                platforms: ['electron' as PlatformType],
            }
        }));
    }

    private getElectronSpecificTools(): ToolDefinition[] {
        return [
            {
                name: 'electron_menu_click',
                description: 'Click an Electron application menu item by label path (e.g., "File > Save")',
                schema: z.object({
                    menuPath: z.string()
                }),
                metadata: {
                    name: 'electron_menu_click',
                    platforms: ['electron' as PlatformType],
                    scope: ToolScope.PLATFORM_SPECIFIC,
                    terminal: false
                },
                execute: (params: { menuPath: string }) => {
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
                                await activeWindow.page.evaluate((path) => {
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
                metadata: {
                    name: 'electron_switch_window',
                    platforms: ['electron' as PlatformType],
                    scope: ToolScope.PLATFORM_SPECIFIC,
                    terminal: false
                },
                execute: (params: { windowId?: string; title?: string; url?: string }) => {
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
                metadata: {
                    name: 'electron_list_windows',
                    platforms: ['electron' as PlatformType],
                    scope: ToolScope.PLATFORM_SPECIFIC,
                    terminal: false
                },
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
                metadata: {
                    name: 'electron_get_window_state',
                    platforms: ['electron' as PlatformType],
                    scope: ToolScope.PLATFORM_SPECIFIC,
                    terminal: false
                },
                execute: (params: { windowId?: string }) => {
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

    private async executeInWindow(
        windowId: string | undefined,
        action: (page: Page) => Promise<ActionResult>
    ): Promise<ActionResult> {
        try {
            let window;
            
            if (windowId) {
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

    /**
     * Get browser automation interface for execution services.
     * Note: ElectronDriver doesn't use MonoBrowserAdapter like WebDriver,
     * so this creates a minimal adapter around the active window.
     */
    getBrowserAutomation(): IBrowserAutomation {
        const win = this.windowManager.getActiveWindow();
        if (!win) {
             throw new Error('[ElectronDriver] No active window available for browser automation.');
        }
        
        const adapter = new AttachedPlaywrightAdapter(
             {} as any, 
             this.logger
        );
        adapter.setPage(win.page);
        return adapter;
    }
}

class AttachedPlaywrightAdapter extends PlaywrightAdapter {
    setPage(page: Page) {
        (this as any).page = page;
        (this as any).browser = page.context().browser();
    }

    override launch(): ResultAsync<void, NavigationError> {
        return okAsync(undefined);
    }
}
