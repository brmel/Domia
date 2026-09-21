import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    // Integration tests drive real browsers, real SQLite and real MCP servers.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Each file boots its own kernel + temp data dir; keep them off each other's toes.
    fileParallelism: false,
  },
});
