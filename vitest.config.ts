import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        include: ['tests/e2e/**/*.test.ts'],
        exclude: ['node_modules/**', 'tests/e2e/cli/**'],
        testTimeout: 120000,
    },
    resolve: {
        alias: {
            '@domain': path.resolve(__dirname, './domain'),
            '@backend': path.resolve(__dirname, './backend'),
            '@infrastructure': path.resolve(__dirname, './infrastructure'),
            '@frontend': path.resolve(__dirname, './frontend'),
            '@shared': path.resolve(__dirname, './shared'),
            '@apps': path.resolve(__dirname, './apps'),
        },
    },
});
