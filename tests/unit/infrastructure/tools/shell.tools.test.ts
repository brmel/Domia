import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { createShellTools } from '@infrastructure/tools/catalog/shell.tools';
import { ActionType } from '@domain/enums/ActionType';
import type { ShellExecutor, ShellResult } from '@infrastructure/shell/ShellExecutor';
import { buildToolCatalog } from '@infrastructure/tools/buildToolCatalog';
import type { ToolDependencies } from '@infrastructure/tools/ToolSpec';
import type { IStructuredAutomation, IPerceptionPipeline, IPerceptionSource } from '@domain/ports';
import { ok } from 'neverthrow';

function createMockExecutor(result?: Partial<ShellResult>): ShellExecutor {
    return {
        execute: vi.fn(async () => ({
            stdout: result?.stdout ?? '',
            stderr: result?.stderr ?? '',
            exitCode: result?.exitCode ?? 0,
        })),
    } as unknown as ShellExecutor;
}

describe('createShellTools', () => {
    it('returns a single shell_exec tool spec', () => {
        const tools = createShellTools(createMockExecutor());

        expect(tools).toHaveLength(1);
        expect(tools[0]!.name).toBe('shell_exec');
        expect(tools[0]!.actionType).toBe(ActionType.SHELL_EXEC);
        expect(tools[0]!.platforms).toBeUndefined();
    });

    it('returns success with stdout/stderr/exitCode on exit 0', async () => {
        const executor = createMockExecutor({ stdout: 'hello\n', stderr: '', exitCode: 0 });
        const [tool] = createShellTools(executor);

        const result = await tool!.execute({ command: 'echo hello' });

        expect(result).toEqual({
            status: 'success',
            stdout: 'hello\n',
            stderr: '',
            exitCode: 0,
        });
        expect(executor.execute).toHaveBeenCalledWith('echo hello', undefined, undefined);
    });

    it('returns error status on non-zero exit', async () => {
        const executor = createMockExecutor({ stdout: '', stderr: 'not found', exitCode: 127 });
        const [tool] = createShellTools(executor);

        const result = await tool!.execute({ command: 'badcmd' });

        expect(result).toEqual({
            status: 'error',
            stdout: '',
            stderr: 'not found',
            exitCode: 127,
        });
    });

    it('passes cwd and timeoutMs to executor', async () => {
        const executor = createMockExecutor();
        const [tool] = createShellTools(executor);

        await tool!.execute({ command: 'ls', cwd: '/tmp', timeoutMs: 5000 });

        expect(executor.execute).toHaveBeenCalledWith('ls', '/tmp', 5000);
    });
});

describe('buildToolCatalog with shell', () => {
    function stubDeps(overrides?: Partial<ToolDependencies>): ToolDependencies {
        return {
            automation: {
                click: vi.fn(async () => ok(undefined)),
                type: vi.fn(async () => ok(undefined)),
                hover: vi.fn(async () => ok(undefined)),
                selectOption: vi.fn(async () => ok(undefined)),
                dragTo: vi.fn(async () => ok(undefined)),
                pressKey: vi.fn(async () => ok(undefined)),
                scroll: vi.fn(async () => ok(undefined)),
                navigateTo: vi.fn(async () => ok(undefined)),
                wait: vi.fn(async () => ok(undefined)),
                extractText: vi.fn(async () => ok('text')),
                mouseMove: vi.fn(async () => ok(undefined)),
                mouseClick: vi.fn(async () => ok(undefined)),
                mouseDoubleClick: vi.fn(async () => ok(undefined)),
                mouseDrag: vi.fn(async () => ok(undefined)),
                mouseScroll: vi.fn(async () => ok(undefined)),
                getCurrentUrl: vi.fn(() => 'https://example.com'),
                getPerceptionSource: vi.fn(() => null),
                getViewportSize: vi.fn(async () => ({ width: 1280, height: 720 })),
                updateRefs: vi.fn(),
            } as unknown as IStructuredAutomation,
            perception: {
                capture: vi.fn(async () => ok({
                    semantic: { ariaSnapshot: '<s>', refs: {} },
                    metadata: { url: 'https://x.com', title: 'T', timestamp: Date.now() },
                    vision: { primaryScreenshot: null, screenshots: [], mimeType: 'image/jpeg' },
                })),
            } as unknown as IPerceptionPipeline,
            perceptionSource: {
                captureScreenshot: vi.fn(async () => Buffer.from('x')),
                captureAriaSnapshot: vi.fn(async () => '<s>'),
                evaluateScript: vi.fn(async () => ({})),
            } as unknown as IPerceptionSource,
            vision: true,
            ...overrides,
        };
    }

    it('includes shell_exec when shellExecutor is provided', () => {
        const catalog = buildToolCatalog(stubDeps({ shellExecutor: createMockExecutor() }));
        const names = catalog.map(t => t.name);

        expect(names).toContain('shell_exec');
    });

    it('omits shell_exec when shellExecutor is not provided', () => {
        const catalog = buildToolCatalog(stubDeps());
        const names = catalog.map(t => t.name);

        expect(names).not.toContain('shell_exec');
    });

    it('shell_exec survives platform filtering for all platforms', () => {
        for (const platform of ['web', 'electron', 'android', 'ios'] as const) {
            const catalog = buildToolCatalog(stubDeps({ shellExecutor: createMockExecutor(), platform }));
            const names = catalog.map(t => t.name);

            expect(names).toContain('shell_exec');
        }
    });

    it('shell_exec is NOT wrapped by recording', async () => {
        const recordings: unknown[] = [];
        const catalog = buildToolCatalog(stubDeps({
            shellExecutor: createMockExecutor({ stdout: 'ok' }),
            recording: { enabled: true },
            onRecording: async (rec) => { recordings.push(rec); },
        }));

        const shellTool = catalog.find(t => t.name === 'shell_exec')!;
        await shellTool.execute({ command: 'echo ok' });

        expect(recordings).toHaveLength(0);
    });
});
