const { app, BrowserWindow } = require('electron');
const path = require('node:path');

app.whenReady().then(() => {
    const win = new BrowserWindow({ width: 800, height: 600, show: true, webPreferences: { contextIsolation: true } });
    win.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
