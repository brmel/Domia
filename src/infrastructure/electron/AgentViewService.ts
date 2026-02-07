import { BrowserWindow, WebContentsView, Rectangle, app } from 'electron';
import { singleton } from 'tsyringe';

/**
 * Service to manage the native WebContentsView for the agent
 */
@singleton()
export class AgentViewService {
    private view: WebContentsView | null = null;
    private mainWindow: BrowserWindow | null = null;
    private isVisible: boolean = false;

    /**
     * Initialize the service with the main window
     */
    initialize(mainWindow: BrowserWindow): void {
        this.mainWindow = mainWindow;
    }

    /**
     * Create or retrieve the existing WebContentsView
     */
    getView(): WebContentsView {
        if (!this.view) {
            this.view = new WebContentsView({
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: false, // Required for some automation tasks, check security implications
                    backgroundThrottling: false, // Keep running when hidden
                }
            });

            // Set a default user agent to look like a real browser
            this.view.webContents.setUserAgent(app.userAgentFallback.replace('Electron/' + process.versions.electron, ''));
        }
        return this.view;
    }

    /**
     * Show the view at specific bounds
     */
    show(bounds: Rectangle): void {
        if (!this.mainWindow || !this.view) {
            this.getView(); // Ensure view exists
        }

        if (this.mainWindow && this.view) {
            // If completely new or re-attaching
            if (this.mainWindow.contentView.children.indexOf(this.view) === -1) {
                this.mainWindow.contentView.addChildView(this.view);
            }

            this.view.setBounds(bounds);
            this.isVisible = true;
        }
    }

    /**
     * Update bounds of the view
     */
    updateBounds(bounds: Rectangle): void {
        if (this.isVisible && this.view) {
            this.view.setBounds(bounds);
        }
    }

    /**
     * Hide the view
     */
    hide(): void {
        if (this.mainWindow && this.view) {
            // We can either removeChildView or move it offscreen. 
            // Removing is cleaner but might reload page? No, WebContentsView persists.
            // Let's remove it from visual tree but keep the object.

            // Actually, keep it attached but broken? Or just remove.
            // Let's try removing it for now.
            if (this.mainWindow.contentView.children.indexOf(this.view) !== -1) {
                this.mainWindow.contentView.removeChildView(this.view);
            }
            this.isVisible = false;
        }
    }

    /**
     * Get the CDP WebSocket URL for Playwright connection
     */
    async getCDPWebSocketURL(): Promise<string> {
        const view = this.getView();

        // Ensure debugger is started
        try {
            if (!view.webContents.debugger.isAttached()) {
                view.webContents.debugger.attach('1.3');
            }
        } catch (err: unknown) {
            // Ignore "Already attached" or similar if race condition
            const message = err instanceof Error ? err.message : String(err);
            console.warn('Debugger attach warning:', message);
        }

        // Wait, Playwright needs the WESSOCKET URL, usually from --remote-debugging-port
        // Electron's `webContents.debugger` is an internal CDP client, not a WebSocket server.

        // To control via Playwright `connectOverCDP`, we need an actual WebSocket URL.
        // Option 1: Launch Electron with `--remote-debugging-port=9222`.
        // Then query http://localhost:9222/json/list to find the view's ws URL.

        // Let's implement that logic.
        return this.findWebSocketUrlForView();
    }

    private async findWebSocketUrlForView(): Promise<string> {
        // We assume Electron was launched with --remote-debugging-port
        const port = process.env['ELECTRON_REMOTE_DEBUGGING_PORT'] || '21222';

        // Retry loop because targets might not be available immediately
        for (let i = 0; i < 5; i++) {
            try {
                const response = await fetch(`http://127.0.0.1:${port}/json/list`);
                const targets = await response.json();

                // Find target matching our webContents
                // Electron targets usually have type 'page' or 'webview'
                // But matching by ID is tricky via /json/list alone unless we check title or url

                // For now, let's filter for the one that is NOT the main window.
                // Main window has the devtools visible mostly, or we can check URL.

                // Better approach: Since we are inside the main process, maybe we can't easily map 
                // webContentsId to the target ID returned by local CDP API.

                // Let's assume the view has a specific dummy URL initially?

                for (const target of targets) {
                    // We can try to identify our view. 
                    // Let's check if we can query by url if we set one.
                    if (this.view?.webContents.getURL() === target.url) {
                        if (target.webSocketDebuggerUrl) {
                            return target.webSocketDebuggerUrl;
                        }
                    }
                }
            } catch (e) {
                // ignore
            }
            await new Promise(r => setTimeout(r, 200));
        }

        throw new Error('Could not find CDP endpoint for Agent View. Ensure Electron is running with --remote-debugging-port.');
    }
}
