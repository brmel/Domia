import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        include: ['tests/component/**/*.test.{ts,tsx}'],
        setupFiles: ['tests/component/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text'],
            include: ['src/presentation/**'],
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
