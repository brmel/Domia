import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        include: ['src/**/*.integration.test.ts'],
        exclude: ['node_modules/**'],
        testTimeout: 120000, // 2 minute timeout for integration tests
    },
    resolve: {
        alias: {
            '@domain': path.resolve(__dirname, './src/domain'),
            '@application': path.resolve(__dirname, './src/application'),
            '@infrastructure': path.resolve(__dirname, './src/infrastructure'),
            '@presentation': path.resolve(__dirname, './src/presentation'),
            '@shared': path.resolve(__dirname, './src/shared'),
        },
    },
});
