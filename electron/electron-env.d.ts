/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// API exposed via preload.ts
interface ElectronAPI {
  test: {
    run: (input: unknown) => Promise<unknown>;
    cancel: () => Promise<unknown>;
    get: (id: string) => Promise<unknown>;
    list: () => Promise<unknown>;
  };
  settings: {
    get: () => Promise<unknown>;
    set: (settings: unknown) => Promise<unknown>;
  };
  onTestUpdate: (callback: (data: unknown) => void) => () => void;
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import('electron').IpcRenderer;
  api: ElectronAPI;
}

