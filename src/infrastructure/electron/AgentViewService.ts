import { BrowserWindow, WebContentsView, Rectangle, app } from 'electron';
import { singleton, inject } from 'tsyringe';
import type { ILogger } from '@domain/ports';
import { ConfigurationError } from '@domain/errors';
import { ELECTRON_DEBUG_PORT } from '@shared/defaults';

interface CDPVersion {
    webSocketDebuggerUrl?: string;
}

@singleton()
export class AgentViewService {
    private view: WebContentsView | null = null;
    private mainWindow: BrowserWindow | null = null;
    private isVisible: boolean = false;
    private isReady: boolean = false;
    private readyPromise: Promise<void> | null = null;

    private readonly AGENT_VIEW_BOOT_URL = 'about:blank#domia-agent-view';

    constructor(@inject('ILogger') private logger: ILogger) { }

    initialize(mainWindow: BrowserWindow): void {
        this.mainWindow = mainWindow;
        this.logger.debug('[AgentViewService] Initializing with main window');
        this.prepareView();
    }

    private prepareView(): void {
        this.view = new WebContentsView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: false,
                backgroundThrottling: false,
            }
        });

        this.view.webContents.setUserAgent(
            app.userAgentFallback.replace('Electron/' + process.versions.electron, '')
        );

        this.readyPromise = new Promise<void>((resolve) => {
            if (this.view) {
                this.view.webContents.once('did-finish-load', () => {
                    this.isReady = true;
                    this.logger.debug('[AgentViewService] WebContentsView ready (did-finish-load)');
                    resolve();
                });
            }
        });

        this.view.webContents.loadURL(this.AGENT_VIEW_BOOT_URL);
        this.logger.debug(`[AgentViewService] Loading ${this.AGENT_VIEW_BOOT_URL}`);
    }

    getView(): WebContentsView {
        if (!this.view) {
            throw new ConfigurationError('AgentViewService not initialized');
        }
        return this.view;
    }

    getViewWebContentsId(): number {
        return this.view?.webContents.id ?? -1;
    }

    async waitUntilReady(): Promise<void> {
        if (this.isReady && this.hasValidBounds()) return;

        if (this.readyPromise) {
            await this.readyPromise;
            if (!this.hasValidBounds()) {
                this.logger.warn('[AgentViewService] Waiting for valid bounds...');
            }
        }
    }

    private hasValidBounds(): boolean {
        if (!this.view) return false;
        try {
            const bounds = this.view.getBounds();
            return bounds.width > 0 && bounds.height > 0;
        } catch (e) {
            return false;
        }
    }

    private sanitizeBounds(bounds: Rectangle): Rectangle | null {
        if (!this.mainWindow) {
            return null;
        }

        const [rawContentWidth, rawContentHeight] = this.mainWindow.getContentSize();
        const contentWidth = rawContentWidth ?? 0;
        const contentHeight = rawContentHeight ?? 0;
        const x = Math.max(0, Math.floor(bounds.x));
        const y = Math.max(0, Math.floor(bounds.y));
        const width = Math.max(0, Math.min(Math.floor(bounds.width), Math.max(0, contentWidth - x)));
        const height = Math.max(0, Math.min(Math.floor(bounds.height), Math.max(0, contentHeight - y)));

        if (width <= 0 || height <= 0) {
            return null;
        }

        return { x, y, width, height };
    }

    show(bounds: Rectangle): void {
        this.logger.debug(`[AgentViewService] show() called with bounds: ${JSON.stringify(bounds)}`);

        if (!this.mainWindow || !this.view) {
            this.logger.warn('[AgentViewService] show() ignored - mainWindow or view missing');
            return;
        }

        const sanitizedBounds = this.sanitizeBounds(bounds);
        if (!sanitizedBounds) {
            this.logger.warn('[AgentViewService] show() ignored due to invalid sanitized bounds');
            return;
        }

        const children = this.mainWindow.contentView.children;
        const index = children.indexOf(this.view);
        const isLast = index === children.length - 1;

        this.view.setBounds(sanitizedBounds);
        this.logger.debug(`[AgentViewService] View bounds set to: ${JSON.stringify(sanitizedBounds)}`);

        if (index === -1) {
            this.mainWindow.contentView.addChildView(this.view);
            this.logger.debug(`[AgentViewService] Added view to hierarchy. Total children: ${this.mainWindow.contentView.children.length}`);
        } else if (!isLast) {
            this.mainWindow.contentView.removeChildView(this.view);
            this.mainWindow.contentView.addChildView(this.view);
            this.logger.debug('[AgentViewService] Moved view to top of hierarchy');
        }

        this.isVisible = true;
    }

    updateBounds(bounds: Rectangle): void {
        if (this.isVisible && this.view) {
            const sanitizedBounds = this.sanitizeBounds(bounds);
            if (!sanitizedBounds) {
                this.logger.warn('[AgentViewService] updateBounds() ignored due to invalid sanitized bounds');
                return;
            }

            this.logger.debug(`[AgentViewService] updateBounds() called with bounds: ${JSON.stringify(sanitizedBounds)}`);
            this.view.setBounds(sanitizedBounds);
        }
    }

    hide(): void {
        if (this.mainWindow && this.view) {
            if (this.isVisible) {
                if (this.mainWindow.contentView.children.indexOf(this.view) !== -1) {
                    this.mainWindow.contentView.removeChildView(this.view);
                }
                this.isVisible = false;
                this.logger.debug('[AgentViewService] View hidden');
            }
        }
    }

    navigateTo(url: string): void {
        if (!this.view) {
            this.logger.warn('[AgentViewService] navigateTo() ignored - view not initialized');
            return;
        }
        this.logger.debug(`[AgentViewService] Navigating live view to: ${url}`);
        this.view.webContents.loadURL(url).catch((err: Error) => {
            // ERR_ABORTED means our new navigation cancelled a previous one — not a real failure
            if (!err.message.includes('ERR_ABORTED')) {
                this.logger.warn(`[AgentViewService] navigateTo failed: ${err.message}`);
            }
        });
    }

    async getCDPWebSocketURL(): Promise<string> {
        await this.waitUntilReady();
        return this.getBrowserEndpoint();
    }

    private async getBrowserEndpoint(): Promise<string> {
        const port = process.env['ELECTRON_REMOTE_DEBUGGING_PORT'] || ELECTRON_DEBUG_PORT;
        this.logger.debug(`[AgentViewService] Getting browser endpoint from port ${port}`);

        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        const version = await response.json() as CDPVersion;

        if (!version.webSocketDebuggerUrl) {
            throw new ConfigurationError('Browser WebSocket URL not available');
        }

        this.logger.debug(`[AgentViewService] Browser endpoint: ${version.webSocketDebuggerUrl}`);
        return version.webSocketDebuggerUrl;
    }
}
