import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

let seq = 0;

const bridge = {
  invoke: (path: string, args: readonly unknown[]): Promise<unknown> => ipcRenderer.invoke('domia:invoke', path, args),
  watch: (path: string, args: readonly unknown[], onEvent: (event: unknown) => void): (() => void) => {
    const id = `w${++seq}`;
    const listener = (_e: IpcRendererEvent, msg: { id: string; event: unknown }) => {
      if (msg.id === id) onEvent(msg.event);
    };
    ipcRenderer.on('domia:watch:event', listener);
    ipcRenderer.send('domia:watch:start', { id, path, args });
    return () => {
      ipcRenderer.send('domia:watch:stop', { id });
      ipcRenderer.removeListener('domia:watch:event', listener);
    };
  },
};

export type DomiaBridge = typeof bridge;
contextBridge.exposeInMainWorld('domia', bridge);
