import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { buildToolCatalog } from '@infrastructure/tools/buildToolCatalog';
import type { ToolDependencies } from '@infrastructure/tools/ToolSpec';
import { ActionType } from '@domain/enums';
import { createStubToolDeps } from '../../../helpers/createStubToolDeps';
import { ok } from 'neverthrow';

/**
 * Integration test for buildToolCatalog.
 * Uses real buildToolCatalog / ToolSpec machinery with minimal I/O stubs.
 * Verifies the complete tool catalog is assembled correctly, platform filtering works,
 * and recording wrapping is properly applied.
 */

describe('buildToolCatalog', () => {
    it('returns interaction, mouse, observe, and control tools by default', () => {
        const catalog = buildToolCatalog(createStubToolDeps());

        expect(catalog.length).toBeGreaterThan(0);
        expect(catalog.some(t => t.category === 'interaction')).toBe(true);
        expect(catalog.some(t => t.category === 'mouse')).toBe(true);
        // Spot-check representative tools from each group
        expect(catalog.some(t => t.name === 'observe')).toBe(true);
        expect(catalog.some(t => t.name === 'pass')).toBe(true);
        expect(catalog.some(t => t.name === 'fail')).toBe(true);
        // Shell tools must NOT appear without a shellExecutor
        expect(catalog.some(t => t.category === 'shell')).toBe(false);
    });

    it('includes shell tools only when shellExecutor is provided', () => {
        const shellExecutor = { executeCommand: vi.fn(async () => ok({ stdout: '', stderr: '', exitCode: 0 })) } as unknown as NonNullable<ToolDependencies['shellExecutor']>;

        const withoutShell = buildToolCatalog(createStubToolDeps());
        const withShell = buildToolCatalog(createStubToolDeps({ shellExecutor }));

        expect(withoutShell.some(t => t.category === 'shell')).toBe(false);
        expect(withShell.some(t => t.category === 'shell')).toBe(true);
        expect(withShell.length).toBeGreaterThan(withoutShell.length);
    });

    it('every tool has name, description, actionType, parameters, and execute', () => {
        const catalog = buildToolCatalog(createStubToolDeps());

        for (const tool of catalog) {
            expect(tool.name).toBeTruthy();
            expect(tool.description).toBeTruthy();
            expect(tool.actionType).toBeTruthy();
            expect(tool.parameters).toBeDefined();
            expect(typeof tool.execute).toBe('function');
        }
    });

    it('only waitForCondition is marked as isLongRunning', () => {
        const catalog = buildToolCatalog(createStubToolDeps());

        const longRunning = catalog.filter(t => t.isLongRunning);
        expect(longRunning).toHaveLength(1);
        expect(longRunning[0]!.name).toBe('waitForCondition');
    });

    it('filters tools by platform', () => {
        const catalog = buildToolCatalog(createStubToolDeps({ platform: 'web' }));

        const names = catalog.map(t => t.name);
        // Web should include ref-based and mouse tools
        expect(names).toContain('click');
        expect(names).toContain('mouse_click_left');
        expect(names).toContain('observe');
        expect(names).toContain('waitForCondition');
    });

    it('applies tool description overrides from promptService', () => {
        const promptService = {
            getPrompt: vi.fn(() => ''),
            getToolDescription: vi.fn((name: string) =>
                name === 'click' ? 'Custom click description' : undefined
            ),
            getAllPrompts: vi.fn(() => ({})),
            getAllToolDescriptions: vi.fn(() => ({})),
            setPromptOverride: vi.fn(),
            setToolDescriptionOverride: vi.fn(),
            resetPrompt: vi.fn(),
            resetToolDescription: vi.fn(),
            resetAll: vi.fn(),
            getOverrides: vi.fn(() => ({})),
        };

        const catalog = buildToolCatalog(createStubToolDeps(), [], promptService as never);

        const clickTool = catalog.find(t => t.name === 'click');
        expect(clickTool!.description).toBe('Custom click description');

        // Other tools retain original descriptions
        const observeTool = catalog.find(t => t.name === 'observe');
        expect(observeTool!.description).toBeTruthy();
        expect(observeTool!.description).not.toBe('Custom click description');
    });

    it('wraps recordable tools with recording when enabled', async () => {
        const recordings: unknown[] = [];
        const deps = createStubToolDeps({
            recording: { enabled: true, options: { maxDurationMs: 30, intervalMs: 10 } },
            onRecording: async (rec) => { recordings.push(rec); },
        });
        const catalog = buildToolCatalog(deps);

        // click should be wrapped (it's a recordable action type)
        const clickTool = catalog.find(t => t.name === 'click');
        expect(clickTool).toBeDefined();

        await clickTool!.execute({ ref: 'e1' });

        // Should have captured a recording
        expect(recordings).toHaveLength(1);
        expect((recordings[0] as { toolName: string }).toolName).toBe('click');
    });

    it('does NOT wrap non-recordable tools (observe, pass, fail) with recording', async () => {
        const recordings: unknown[] = [];
        const deps = createStubToolDeps({
            recording: { enabled: true },
            onRecording: async (rec) => { recordings.push(rec); },
        });
        const catalog = buildToolCatalog(deps);

        // observe should NOT be wrapped
        const observeTool = catalog.find(t => t.name === 'observe');
        await observeTool!.execute({});
        expect(recordings).toHaveLength(0);

        // pass should NOT be wrapped
        const passTool = catalog.find(t => t.name === 'pass');
        passTool!.execute({});
        expect(recordings).toHaveLength(0);
    });

    it('includes extra tools in the catalog', () => {
        const { z } = require('zod') as typeof import('zod');
        const extra = {
            name: 'custom_tool',
            description: 'A custom tool',
            actionType: ActionType.EXTRACT,
            parameters: z.object({ data: z.string() }),
            execute: async () => ({ status: 'success' as const }),
        };

        const catalog = buildToolCatalog(createStubToolDeps(), [extra as never]);
        const names = catalog.map(t => t.name);
        expect(names).toContain('custom_tool');
    });

    it('excludes electron-only tools when platform is web', () => {
        const catalog = buildToolCatalog(createStubToolDeps({ platform: 'web' }));
        const names = catalog.map(t => t.name);

        expect(names).not.toContain('list_windows');
        expect(names).not.toContain('switch_window');
    });

    it('includes electron tools when platform is electron and windowManager is provided', () => {
        const windowManager = {
            getAllWindows: vi.fn(() => []),
            getActiveWindow: vi.fn(() => null),
            setActiveWindow: vi.fn(() => ok(undefined)),
        } as unknown as NonNullable<ToolDependencies['windowManager']>;

        const catalog = buildToolCatalog(createStubToolDeps({ platform: 'electron', windowManager }));
        const names = catalog.map(t => t.name);

        expect(names).toContain('list_windows');
        expect(names).toContain('switch_window');
    });

    it('omits electron tools when windowManager is not provided even on electron platform', () => {
        const catalog = buildToolCatalog(createStubToolDeps({ platform: 'electron' }));
        const names = catalog.map(t => t.name);

        expect(names).not.toContain('list_windows');
        expect(names).not.toContain('switch_window');
    });
});
