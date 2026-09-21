import { ipcMain, type IpcMainInvokeEvent, type IpcMainEvent, type WebContents } from 'electron';
import type { ApiRouter } from '@domia/hosts';

interface WatchStart { readonly id: string; readonly path: string; readonly args: readonly unknown[] }
interface WatchStop { readonly id: string }

export function wireIpc(router: ApiRouter, target: () => WebContents | undefined): () => void {
  const streams = new Map<string, AbortController>();

  const onInvoke = (_e: IpcMainInvokeEvent, path: string, args: readonly unknown[]) => router.invoke(path, args);
  const onStart = (_e: IpcMainEvent, msg: WatchStart) => {
    const ctrl = new AbortController();
    streams.set(msg.id, ctrl);
    router.watch(msg.path, msg.args, (event) => target()?.send('domia:watch:event', { id: msg.id, event }), ctrl.signal);
  };
  const onStop = (_e: IpcMainEvent, msg: WatchStop) => {
    streams.get(msg.id)?.abort();
    streams.delete(msg.id);
  };

  ipcMain.handle('domia:invoke', onInvoke);
  ipcMain.on('domia:watch:start', onStart);
  ipcMain.on('domia:watch:stop', onStop);

  return () => {
    ipcMain.removeHandler('domia:invoke');
    ipcMain.removeListener('domia:watch:start', onStart);
    ipcMain.removeListener('domia:watch:stop', onStop);
    for (const ctrl of streams.values()) ctrl.abort();
    streams.clear();
  };
}
