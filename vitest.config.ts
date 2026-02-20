import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts', 'tests/**/*.test.tsx'],
        exclude: ['src/**/*.integration.test.ts', 'tests/**/*.integration.test.ts', 'node_modules/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            exclude: ['node_modules/**', 'dist/**', 'dist-electron/**'],
        },
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
