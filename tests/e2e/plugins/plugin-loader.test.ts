import 'reflect-metadata';
import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import { PluginLoader } from '@infrastructure/plugins/PluginLoader';
import { PluginRegistry } from '@infrastructure/plugins/PluginRegistry';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';

const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures/plugins');
const BAD_DIR = path.resolve(__dirname, '../../fixtures/plugins-bad');
const ESCAPE_DIR = path.resolve(__dirname, '../../fixtures/plugins-escape');

const noopBus = { emit: () => {}, on: () => () => {} };

let activeLoader: PluginLoader | null = null;

afterEach(async () => {
    if (activeLoader) {
        await activeLoader.dispose();
        activeLoader = null;
    }
});

describe('Plugin loader (e2e, worker-thread isolated)', () => {
    it('loads a real plugin manifest from disk and registers its tools', async () => {
        const logger = new ConsoleLogger();
        const registry = new PluginRegistry(logger, noopBus);
        const loader = new PluginLoader(logger, registry);
        activeLoader = loader;

        await loader.loadAll(FIXTURE_DIR);

        const tools = registry.getAllTools();
        expect(tools.some((t) => t.name === 'echo_message')).toBe(true);
    });

    it('executes a plugin tool through the worker RPC and returns the value', async () => {
        const logger = new ConsoleLogger();
        const registry = new PluginRegistry(logger, noopBus);
        const loader = new PluginLoader(logger, registry);
        activeLoader = loader;

        await loader.loadAll(FIXTURE_DIR);

        const tool = registry.getAllTools().find((t) => t.name === 'echo_message');
        expect(tool).toBeDefined();

        const result = await tool!.execute({ message: 'hello' });
        expect(result).toEqual({ status: 'ok', message: 'hello' });
    });

    it('rejects a manifest with a built-in tool name collision', async () => {
        const logger = new ConsoleLogger();
        const registry = new PluginRegistry(logger, noopBus);
        const loader = new PluginLoader(logger, registry);
        activeLoader = loader;

        await loader.loadAll(FIXTURE_DIR, new Set(['echo_message']));

        expect(registry.getAllTools()).toHaveLength(0);
    });

    it('rejects a manifest declaring an unknown capability', async () => {
        const logger = new ConsoleLogger();
        const registry = new PluginRegistry(logger, noopBus);
        const loader = new PluginLoader(logger, registry);
        activeLoader = loader;

        await loader.loadAll(BAD_DIR);

        expect(registry.getAllTools()).toHaveLength(0);
    });

    it('blocks plugin code from accessing host APIs not granted as capabilities', async () => {
        const logger = new ConsoleLogger();
        const registry = new PluginRegistry(logger, noopBus);
        const loader = new PluginLoader(logger, registry);
        activeLoader = loader;

        await loader.loadAll(ESCAPE_DIR);

        expect(registry.getAllTools()).toHaveLength(0);
    });
});
