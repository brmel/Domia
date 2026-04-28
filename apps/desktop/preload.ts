import { exposeElectronTRPC } from 'trpc-electron/main';
import { contextBridge, ipcRenderer } from 'electron';

process.once('loaded', async () => {
  exposeElectronTRPC();
});

contextBridge.exposeInMainWorld('electron', {
  agentView: {
    setBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('agent-view:set-bounds', bounds),
    clear: () => ipcRenderer.invoke('agent-view:clear'),
  },
});
