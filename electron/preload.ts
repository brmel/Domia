import { ipcRenderer, contextBridge } from 'electron';

// Minimal, secure API exposure
// Only expose specific IPC channels, never raw ipcRenderer
contextBridge.exposeInMainWorld('api', {
  test: {
    run: (input: unknown): Promise<unknown> => ipcRenderer.invoke('test:run', input),
    cancel: (): Promise<unknown> => ipcRenderer.invoke('test:cancel'),
    get: (id: string): Promise<unknown> => ipcRenderer.invoke('test:get', id),
    list: (): Promise<unknown> => ipcRenderer.invoke('test:list'),
  },
  settings: {
    get: (): Promise<unknown> => ipcRenderer.invoke('settings:get'),
    set: (settings: unknown): Promise<unknown> => ipcRenderer.invoke('settings:set', settings),
  },
  onTestUpdate: (callback: (data: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => callback(data);
    ipcRenderer.on('test:update', handler);
    return () => ipcRenderer.off('test:update', handler);
  },
});
