import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

// Path aliases used by all builds
const pathAliases = {
  '@domain': path.resolve(__dirname, './src/domain'),
  '@application': path.resolve(__dirname, './src/application'),
  '@infrastructure': path.resolve(__dirname, './src/infrastructure'),
  '@presentation': path.resolve(__dirname, './src/presentation'),
  '@shared': path.resolve(__dirname, './src/shared'),
}

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: ['playwright', 'better-sqlite3', 'keytar'],
            },
          },
          resolve: {
            alias: pathAliases,
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: 'preload.cjs',
              },
            },
          },
        },
      },
      renderer: process.env.NODE_ENV === 'test' ? undefined : {},
    }),
  ],
  resolve: {
    alias: pathAliases,
  },
  server: {
    watch: {
      ignored: ['**/domia.config.json', '**/domia.db', '**/artifacts/**'],
    },
  },
})
