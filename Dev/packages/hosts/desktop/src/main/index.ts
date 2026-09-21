import { app, BrowserWindow } from 'electron';
import { EP } from '@domia/contracts';
import { bootHeadless, createApiRouter } from '@domia/hosts';
import { createApi } from '@domia/api';
import { createMainWindow } from './window.js';
import { wireIpc } from './ipcWiring.js';
import { registerArtifactScheme, serveArtifacts } from './artifactProtocol.js';

registerArtifactScheme();

function forwardRemoteDebuggingPortFromEnv(): void {
  const port = process.env['ELECTRON_REMOTE_DEBUGGING_PORT'];
  if (port) app.commandLine.appendSwitch('remote-debugging-port', port);
}

forwardRemoteDebuggingPortFromEnv();

async function boot(): Promise<void> {
  const booted = await bootHeadless();
  if (booted.isErr()) {
    console.error('domia: boot failed —', booted.error.code, booted.error.message);
    app.quit();
    return;
  }
  const { kernel } = booted.value;

  const store = kernel.resolve(EP.Store);
  if (store.isOk()) serveArtifacts(store.value);

  const router = createApiRouter(createApi(kernel, true));
  let win = createMainWindow();
  const unwire = wireIpc(router, () => win.webContents);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) win = createMainWindow();
  });
  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') return;
    unwire();
    void kernel.shutdown().finally(() => app.quit());
  });
}

void app.whenReady().then(boot);
