import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { buildToolCatalog } from '@infrastructure/tools/buildToolCatalog';
import type { ToolDependencies } from '@infrastructure/tools/ToolSpec';
import type { IStructuredAutomation, IPerceptionPipeline, IPerceptionSource } from '@domain/ports';
import { ActionType } from '@domain/enums/ActionType';
import { ok } from 'neverthrow';

/**
 * Integration test for buildToolCatalog.
 * Uses real buildToolCatalog / ToolSpec machinery with minimal I/O stubs.
 * Verifies the complete tool catalog is assembled correctly, platform filtering works,
 * and recording wrapping is properly applied.
 */

function createStubAutomation(): IStructuredAutomation {
    const stub = {
        click: vi.fn(async () => ok(undefined)),
        type: vi.fn(async () => ok(undefined)),
        hover: vi.fn(async () => ok(undefined)),
        selectOption: vi.fn(async () => ok(undefined)),
        dragTo: vi.fn(async () => ok(undefined)),
        pressKey: vi.fn(async () => ok(undefined)),
        scroll: vi.fn(async () => ok(undefined)),
        navigateTo: vi.fn(async () => ok(undefined)),
        wait: vi.fn(async () => ok(undefined)),
        extractText: vi.fn(async () => ok('some text')),
        mouseMove: vi.fn(async () => ok(undefined)),
        mouseClick: vi.fn(async () => ok(undefined)),
        mouseDoubleClick: vi.fn(async () => ok(undefined)),
        mouseDrag: vi.fn(async () => ok(undefined)),
        mouseScroll: vi.fn(async () => ok(undefined)),
        getCurrentUrl: vi.fn(() => 'https://example.com'),
        getPerceptionSource: vi.fn(() => null),
        getViewportSize: vi.fn(async () => ({ width: 1280, height: 720 })),
        updateRefs: vi.fn(),
    } as unknown as IStructuredAutomation;
    return stub;
}

function createStubPerception(): IPerceptionPipeline {
    return {
        capture: vi.fn(async () => ok({
            semantic: { ariaSnapshot: '<snapshot>', refs: {} },
            metadata: { url: 'https://example.com', title: 'Test', timestamp: Date.now() },
            vision: { primaryScreenshot: null, screenshots: [], mimeType: 'image/jpeg' },
        })),
    } as unknown as IPerceptionPipeline;
}

function createStubPerceptionSource(): IPerceptionSource {
    return {
        captureScreenshot: vi.fn(async () => Buffer.from('fake')),
        captureAriaSnapshot: vi.fn(async () => '<snapshot>'),
    } as unknown as IPerceptionSource;
}

function createDeps(overrides?: Partial<ToolDependencies>): ToolDependencies {
    return {
        automation: createStubAutomation(),
        perception: createStubPerception(),
        perceptionSource: createStubPerceptionSource(),
        vision: true,
        ...overrides,
    };
}

// All expected tool names in the full catalog (no platform filter)
const ALL_TOOL_NAMES = [
    'click', 'type', 'hover', 'selectOption', 'dragTo', 'pressKey',
    'mouse_move', 'mouse_click_left', 'mouse_click_right', 'mouse_double_click', 'mouse_drag', 'mouse_scroll',
    'scroll', 'navigate',
    'observe', 'extract', 'wait', 'waitForCondition',
    'pass', 'fail',
];

describe('buildToolCatalog', () => {
    it('returns all tools when no platform filter is applied', () => {
        const catalog = buildToolCatalog(createDeps());

        const names = catalog.map(t => t.name);
        for (const expected of ALL_TOOL_NAMES) {
            expect(names).toContain(expected);
        }
        expect(catalog).toHaveLength(ALL_TOOL_NAMES.length);
    });

    it('every tool has name, description, actionType, parameters, and execute', () => {
        const catalog = buildToolCatalog(createDeps());

        for (const tool of catalog) {
            expect(tool.name).toBeTruthy();
            expect(tool.description).toBeTruthy();
            expect(tool.actionType).toBeTruthy();
            expect(tool.parameters).toBeDefined();
            expect(typeof tool.execute).toBe('function');
        }
    });

    it('only waitForCondition is marked as isLongRunning', () => {
        const catalog = buildToolCatalog(createDeps());

        const longRunning = catalog.filter(t => t.isLongRunning);
        expect(longRunning).toHaveLength(1);
        expect(longRunning[0]!.name).toBe('waitForCondition');
    });

    it('filters tools by platform', () => {
        const catalog = buildToolCatalog(createDeps({ platform: 'web' }));

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

        const catalog = buildToolCatalog(createDeps(), [], promptService as never);

        const clickTool = catalog.find(t => t.name === 'click');
        expect(clickTool!.description).toBe('Custom click description');

        // Other tools retain original descriptions
        const observeTool = catalog.find(t => t.name === 'observe');
        expect(observeTool!.description).toBeTruthy();
        expect(observeTool!.description).not.toBe('Custom click description');
    });

    it('wraps recordable tools with recording when enabled', async () => {
        const recordings: unknown[] = [];
        const deps = createDeps({
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
        const deps = createDeps({
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

        const catalog = buildToolCatalog(createDeps(), [extra as never]);
        const names = catalog.map(t => t.name);
        expect(names).toContain('custom_tool');
    });
});
