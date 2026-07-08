import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        include: ['tests/e2e/**/*.test.ts'],
        // Only *.test.ts run; the live LLM-driven CLI scenarios are named *-test.ts
        // (run separately via `npm run test:cli`), so they're already out of scope.
        exclude: ['node_modules/**'],
        testTimeout: 120000,
        // Real-browser/DB e2e: run files serially so concurrent Chromium instances don't
        // contend (a parallel run starved the LongWait observation stream's timer -> flake).
        fileParallelism: false,
        coverage: {
            provider: 'v8',
            include: ['domain/**', 'backend/**', 'infrastructure/**', 'shared/**'],
            reporter: ['text-summary', 'html'],
            // Regression floor just under the measured baseline (61/70/55) — raise as coverage grows.
            thresholds: {
                lines: 55,
                branches: 62,
                functions: 48,
                statements: 55,
            },
        },
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
