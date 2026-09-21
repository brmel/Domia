const { app, BrowserWindow } = require('electron');
const path = require('node:path');

// Mirror apps/desktop/main.ts: expose the Chromium CDP endpoint so ElectronDriver
// can connect (Electron does not honor ELECTRON_REMOTE_DEBUGGING_PORT natively).
const debugPort = process.env['ELECTRON_REMOTE_DEBUGGING_PORT'];
if (app && debugPort) {
    app.commandLine.appendSwitch('remote-debugging-port', debugPort);
}

// Chromium's sandbox needs a SUID helper that CI images do not ship; without this
// the window never opens, window-all-closed fires, and the app exits 0.
if (process.platform === 'linux') {
    app.commandLine.appendSwitch('no-sandbox');
}

app.whenReady().then(() => {
    const win = new BrowserWindow({ width: 800, height: 600, show: true, webPreferences: { contextIsolation: true } });
    win.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
