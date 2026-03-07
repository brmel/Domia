import 'reflect-metadata';
import 'dotenv/config';

import { registerCoreServices } from '../src/composition-root';
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIPCHandler } from 'trpc-electron/main';
import { appRouter } from './router';
import { ContainerBuilder } from '../src/composition/ContainerBuilder';
import { ELECTRON_DEBUG_PORT, AGENT_VIEW_WIDTH, AGENT_VIEW_HEIGHT } from '../src/shared/defaults';

registerCoreServices();
new ContainerBuilder().initializePlatformProviders();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

// Allow port configuration via env var (useful for testing)
const debugPort = process.env['ELECTRON_REMOTE_DEBUGGING_PORT'] || ELECTRON_DEBUG_PORT;
app.commandLine.appendSwitch('remote-debugging-port', debugPort);
app.commandLine.appendSwitch('ignore-certificate-errors');

let win: BrowserWindow | null;

function createWindow(): void {
  win = new BrowserWindow({
    width: AGENT_VIEW_WIDTH,
    height: AGENT_VIEW_HEIGHT,
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Log renderer crashes
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Main] Renderer process gone:', details);
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
