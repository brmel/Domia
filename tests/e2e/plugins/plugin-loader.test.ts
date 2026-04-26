import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { PluginLoader } from '@infrastructure/plugins/PluginLoader';
import { PluginRegistry } from '@infrastructure/plugins/PluginRegistry';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/plugins');

const noopBus = { emit: () => {}, on: () => () => {} };

describe('Plugin loader (e2e)', () => {
    it('loads a real plugin manifest from disk and registers its tools', async () => {
        const logger = new ConsoleLogger();
        const registry = new PluginRegistry(logger, noopBus);
        const loader = new PluginLoader(logger, registry);

        await loader.loadAll(FIXTURE_DIR);

        const tools = registry.getAllTools();
        expect(tools.length).toBeGreaterThan(0);
        expect(tools.some((t) => t.name === 'echo_message')).toBe(true);
    });

    it('rejects a manifest with a built-in tool name collision', async () => {
        const logger = new ConsoleLogger();
        const registry = new PluginRegistry(logger, noopBus);
        const loader = new PluginLoader(logger, registry);

        await loader.loadAll(FIXTURE_DIR, new Set(['echo_message']));

        expect(registry.getAllTools()).toHaveLength(0);
    });
});
