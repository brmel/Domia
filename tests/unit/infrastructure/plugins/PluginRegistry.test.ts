import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ILogger } from '@domain/ports';
import { PluginRegistry } from '@infrastructure/plugins/PluginRegistry';
import type { PluginManifest } from '@infrastructure/plugins/PluginManifest';
import { z } from 'zod';

function createLogger(): ILogger {
    return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function fakeManifest(name: string, toolNames: string[]): PluginManifest {
    return {
        name,
        tools: toolNames.map((n) => ({
            name: n,
            description: `${n} description`,
            actionType: 'interaction' as never,
            parameters: z.object({}),
            execute: vi.fn(async () => ({})),
        })),
    };
}

describe('PluginRegistry', () => {
    let registry: PluginRegistry;
    const builtIns = new Set(['click', 'type', 'scroll']);

    beforeEach(() => {
        registry = new PluginRegistry(createLogger());
    });

    it('registers a plugin and retrieves its tools', () => {
        const manifest = fakeManifest('my-plugin', ['customTool']);
        registry.register(manifest, builtIns);

        expect(registry.getPluginCount()).toBe(1);
        expect(registry.getAllTools()).toHaveLength(1);
        expect(registry.getAllTools()[0]!.name).toBe('customTool');
    });

    it('registers multiple plugins', () => {
        registry.register(fakeManifest('p1', ['a']), builtIns);
        registry.register(fakeManifest('p2', ['b', 'c']), builtIns);

        expect(registry.getPluginCount()).toBe(2);
        expect(registry.getAllTools()).toHaveLength(3);
    });

    it('throws on collision with built-in tool', () => {
        const manifest = fakeManifest('bad-plugin', ['click']);
        expect(() => registry.register(manifest, builtIns)).toThrow(
            /conflicts with built-in tool/,
        );
    });

    it('throws on collision with already-registered plugin tool', () => {
        registry.register(fakeManifest('p1', ['shared']), builtIns);

        expect(() => registry.register(fakeManifest('p2', ['shared']), builtIns)).toThrow(
            /conflicts with plugin "p1"/,
        );
    });

    it('clear empties all plugins', () => {
        registry.register(fakeManifest('p1', ['x']), builtIns);
        registry.clear();

        expect(registry.getPluginCount()).toBe(0);
        expect(registry.getAllTools()).toEqual([]);
    });

    it('returns empty array when no plugins registered', () => {
        expect(registry.getAllTools()).toEqual([]);
        expect(registry.getPluginCount()).toBe(0);
    });
});
