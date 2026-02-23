import 'reflect-metadata';
import 'dotenv/config';
import { registerCoreServices, container } from '../src/composition-root';
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createIPCHandler } from 'trpc-electron/main';
import createDebug from 'debug';
import { appRouter } from './router';
import { AgentViewService } from '../src/infrastructure/electron/AgentViewService';
import { ElectronViewHost } from '../src/infrastructure/adapters/view/ElectronViewHost';
import { initializePlatformProviders } from '../src/composition/modules/registerPlatformModule';

const log = createDebug('domia:electron:main');

registerCoreServices();
container.register(AgentViewService, { useClass: AgentViewService });
container.register('IViewHost', { useClass: ElectronViewHost });
initializePlatformProviders();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '../.env') });

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

// Allow port configuration via env var (useful for testing)
const debugPort = process.env['ELECTRON_REMOTE_DEBUGGING_PORT'] || '21223';
app.commandLine.appendSwitch('remote-debugging-port', debugPort);
app.commandLine.appendSwitch('ignore-certificate-errors');

let win: BrowserWindow | null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
    },
  });

  const agentViewService = container.resolve(AgentViewService);
  agentViewService.initialize(win);

  ipcMain.on('agent-view:resize', (event, bounds: Electron.Rectangle) => {
    const senderUrl = event.senderFrame?.url || event.sender.getURL();
    log('[agent-view:resize] %o', { bounds, senderUrl });
    agentViewService.updateBounds(bounds);
  });

  ipcMain.on('agent-view:show', (event, bounds: Electron.Rectangle) => {
    const senderUrl = event.senderFrame?.url || event.sender.getURL();
    log('[agent-view:show] %o', { bounds, senderUrl });
    agentViewService.show(bounds);
  });

  ipcMain.on('agent-view:hide', () => {
    agentViewService.hide();
  });

  // Log renderer crashes
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Main] Renderer process gone:', details);
  });

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  });

  createIPCHandler({ router: appRouter, windows: [win] });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(createWindow);
