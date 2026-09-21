import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const uiRoot = resolve(__dirname, '../../ui');

// The @domia/* workspace packages ship TypeScript source (main: src/index.ts), so
// they must be bundled (esbuild transpiles them); only real npm deps stay external.
const bundleWorkspace = { exclude: ['@domia/contracts', '@domia/kernel', '@domia/trace', '@domia/store', '@domia/tools', '@domia/agent', '@domia/case', '@domia/plan', '@domia/memory', '@domia/skills', '@domia/loop', '@domia/api', '@domia/hosts', '@domia/domia-mcp', '@domia/conformance'] };

const cjs = (input: string) => ({ minify: true as const, rollupOptions: { input, external: ['electron'], output: { format: 'cjs' as const, entryFileNames: '[name].cjs' } } });

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(bundleWorkspace)],
    build: cjs(resolve(__dirname, 'src/main/index.ts')),
  },
  preload: {
    plugins: [externalizeDepsPlugin(bundleWorkspace)],
    build: cjs(resolve(__dirname, 'src/preload/index.ts')),
  },
  renderer: {
    root: uiRoot,
    plugins: [react()],
    build: { rollupOptions: { input: resolve(uiRoot, 'index.html') } },
  },
});
