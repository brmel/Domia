import { BrowserWindow, WebContentsView, Rectangle, app } from 'electron';
import { singleton, inject } from 'tsyringe';
import type { ILogger } from '@domain/ports';
import { ConfigurationError } from '@domain/errors';

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
            this.view!.webContents.once('did-finish-load', () => {
                this.isReady = true;
                this.logger.debug('[AgentViewService] WebContentsView ready');
                resolve();
            });
        });

        this.view.webContents.loadURL('about:blank');
        this.logger.debug('[AgentViewService] Loading about:blank');
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
        if (this.isReady) return;
        if (this.readyPromise) {
            await this.readyPromise;
        }
    }

    show(bounds: Rectangle): void {
        if (!this.mainWindow || !this.view) return;

        const children = this.mainWindow.contentView.children;
        const index = children.indexOf(this.view);
        const isLast = index === children.length - 1;

        if (index === -1) {
            this.mainWindow.contentView.addChildView(this.view);
            this.logger.debug(`[AgentViewService] Added view to hierarchy. Total children: ${this.mainWindow.contentView.children.length}`);
        } else if (!isLast) {
            // Only re-order if it's NOT already at the top
            this.mainWindow.contentView.removeChildView(this.view);
            this.mainWindow.contentView.addChildView(this.view);
            this.logger.debug('[AgentViewService] Moved view to top of hierarchy');
        }

        // Only update bounds if they changed (simple check)
        const current = this.view.getBounds();
        if (current.x !== bounds.x || current.y !== bounds.y || current.width !== bounds.width || current.height !== bounds.height) {
            this.view.setBounds(bounds);
            this.logger.debug(`[AgentViewService] View shown at: ${JSON.stringify(bounds)}`);
        }

        this.isVisible = true;
    }

    updateBounds(bounds: Rectangle): void {
        if (this.isVisible && this.view) {
            const current = this.view.getBounds();
            if (current.x !== bounds.x || current.y !== bounds.y || current.width !== bounds.width || current.height !== bounds.height) {
                this.view.setBounds(bounds);
            }
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

    async getCDPWebSocketURL(): Promise<string> {
        await this.waitUntilReady();
        return this.getBrowserEndpoint();
    }

    private async getBrowserEndpoint(): Promise<string> {
        const port = process.env['ELECTRON_REMOTE_DEBUGGING_PORT'] || '21223';
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
