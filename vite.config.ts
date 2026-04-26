import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

const pathAliases = {
  '@domain': path.resolve(__dirname, './domain'),
  '@backend': path.resolve(__dirname, './backend'),
  '@infrastructure': path.resolve(__dirname, './infrastructure'),
  '@frontend': path.resolve(__dirname, './frontend'),
  '@shared': path.resolve(__dirname, './shared'),
  '@apps': path.resolve(__dirname, './apps'),
}

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'apps/desktop/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: [
                'playwright',
                'sql.js',
                'kysely-wasm',
                'keytar',
                'bufferutil',
                'utf-8-validate',
                'protobufjs',
                '@protobufjs/inquire',
                'junit-report-builder',
              ],
            },
          },
          resolve: { alias: pathAliases },
        },
      },
      preload: {
        input: path.join(__dirname, 'apps/desktop/preload.ts'),
        vite: {
          build: {
            rollupOptions: {
              output: { format: 'cjs', entryFileNames: 'preload.cjs' },
            },
          },
        },
      },
      renderer: process.env.NODE_ENV === 'test' ? undefined : {},
    }),
  ],
  resolve: { alias: pathAliases },
  optimizeDeps: {
    include: ['zod', 'react', 'react-dom', '@tanstack/react-query', 'trpc-electron/renderer', 'zustand'],
  },
  server: {
    watch: {
      ignored: ['**/domia.config.json', '**/domia.db', '**/artifacts/**', '**/article.txt', '**/page.html'],
    },
  },
})
