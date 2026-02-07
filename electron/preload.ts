import { exposeElectronTRPC } from 'trpc-electron/main';
import { contextBridge, ipcRenderer } from 'electron';

process.once('loaded', async () => {
  exposeElectronTRPC();

  contextBridge.exposeInMainWorld('electron', {
    agentView: {
      resize: (bounds: { x: number; y: number; width: number; height: number }) =>
        ipcRenderer.send('agent-view:resize', bounds),
      show: (bounds: { x: number; y: number; width: number; height: number }) =>
        ipcRenderer.send('agent-view:show', bounds),
      hide: () => ipcRenderer.send('agent-view:hide'),
    }
  });
});
