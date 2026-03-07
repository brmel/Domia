import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ok, err } from 'neverthrow';
import { createElectronTools } from '@infrastructure/tools/catalog/electron.tools';
import type { ElectronWindowManager, ElectronWindow } from '@infrastructure/drivers/ElectronWindowManager';
import type { IStructuredAutomation } from '@domain/ports';
import { ActionType } from '@domain/enums';
import { ValidationError } from '@domain/CDPValidator';

/**
 * Unit tests for createElectronTools.
 * Uses a stub ElectronWindowManager — no real browser processes are started.
 * Tests real tool logic: list_windows, switch_window.
 */

function makeFakePage(url = 'https://example.com') {
    return {
        url: () => url,
        title: () => Promise.resolve('Test Window'),
        bringToFront: vi.fn().mockResolvedValue(undefined),
    } as unknown as import('playwright').Page;
}

function makeWindow(id: string, title: string, url: string): ElectronWindow {
    return { id, page: makeFakePage(url), title, url };
}

function makeWindowManager(windows: ElectronWindow[], activeId?: string): ElectronWindowManager {
    const activeWindow = activeId ? windows.find(w => w.id === activeId) ?? null : windows[0] ?? null;

    return {
        getAllWindows: vi.fn(() => windows),
        getActiveWindow: vi.fn(() => activeWindow),
        setActiveWindow: vi.fn((id: string) => {
            const found = windows.find(w => w.id === id);
            return found ? ok(undefined) : err(new ValidationError(`Window ${id} not found`, 'windowId'));
        }),
    } as unknown as ElectronWindowManager;
}

function makeAutomation(): IStructuredAutomation & { setAttachedPage: ReturnType<typeof vi.fn> } {
    return {
        setAttachedPage: vi.fn(),
    } as unknown as IStructuredAutomation & { setAttachedPage: ReturnType<typeof vi.fn> };
}

describe('createElectronTools', () => {
    it('returns exactly two tools: list_windows and switch_window', () => {
        const tools = createElectronTools(makeWindowManager([]), makeAutomation());
        expect(tools).toHaveLength(2);
        expect(tools[0]!.name).toBe('list_windows');
        expect(tools[1]!.name).toBe('switch_window');
    });

    it('tools have correct actionTypes', () => {
        const tools = createElectronTools(makeWindowManager([]), makeAutomation());
        expect(tools[0]!.actionType).toBe(ActionType.LIST_WINDOWS);
        expect(tools[1]!.actionType).toBe(ActionType.SWITCH_WINDOW);
    });

    it('tools are scoped to the electron platform', () => {
        const tools = createElectronTools(makeWindowManager([]), makeAutomation());
        for (const tool of tools) {
            expect(tool.platforms).toEqual(['electron']);
        }
    });
});

describe('list_windows tool', () => {
    it('returns empty list when no windows are registered', () => {
        const [listTool] = createElectronTools(makeWindowManager([]), makeAutomation());
        const result = listTool!.execute({}) as { windows: unknown[]; count: number };

        expect(result.windows).toEqual([]);
        expect(result.count).toBe(0);
    });

    it('lists all registered windows with id, title, url, and active flag', () => {
        const win1 = makeWindow('win-0', 'Main', 'https://app.example.com');
        const win2 = makeWindow('win-1', 'Settings', 'https://app.example.com/settings');
        const manager = makeWindowManager([win1, win2], 'win-0');

        const [listTool] = createElectronTools(manager, makeAutomation());
        const result = listTool!.execute({}) as { windows: Array<Record<string, unknown>>; count: number };

        expect(result.count).toBe(2);
        expect(result.windows[0]).toMatchObject({ id: 'win-0', title: 'Main', active: true });
        expect(result.windows[1]).toMatchObject({ id: 'win-1', title: 'Settings', active: false });
    });

    it('marks only the active window with active: true', () => {
        const win1 = makeWindow('win-0', 'A', 'https://a.com');
        const win2 = makeWindow('win-1', 'B', 'https://b.com');
        const manager = makeWindowManager([win1, win2], 'win-1');

        const [listTool] = createElectronTools(manager, makeAutomation());
        const result = listTool!.execute({}) as { windows: Array<{ active: boolean }> };

        expect(result.windows[0]!.active).toBe(false);
        expect(result.windows[1]!.active).toBe(true);
    });
});

describe('switch_window tool', () => {
    it('switches to the requested window and calls bringToFront', async () => {
        const win1 = makeWindow('win-0', 'Main', 'https://app.com');
        const win2 = makeWindow('win-1', 'Settings', 'https://app.com/settings');
        const manager = makeWindowManager([win1, win2], 'win-0');

        // After switching, getActiveWindow returns the new active window
        (manager.getActiveWindow as ReturnType<typeof vi.fn>).mockReturnValue(win2);

        const [, switchTool] = createElectronTools(manager, makeAutomation());
        const result = await switchTool!.execute({ windowId: 'win-1' }) as Record<string, unknown>;

        expect(manager.setActiveWindow).toHaveBeenCalledWith('win-1');
        expect(win2.page.bringToFront).toHaveBeenCalledOnce();
        expect(result['windowId']).toBe('win-1');
        expect(result['title']).toBe('Settings');
    });

    it('returns error when trying to switch to a non-existent window', async () => {
        const manager = makeWindowManager([], undefined);

        const [, switchTool] = createElectronTools(manager, makeAutomation());
        const result = await switchTool!.execute({ windowId: 'win-99' }) as { status: string; error: string };

        expect(result.status).toBe('error');
        expect(result.error).toContain('win-99');
    });

    it('calls setAttachedPage on automation after switching', async () => {
        const win1 = makeWindow('win-0', 'Main', 'https://app.com');
        const manager = makeWindowManager([win1], 'win-0');
        (manager.getActiveWindow as ReturnType<typeof vi.fn>).mockReturnValue(win1);

        const automation = makeAutomation();
        const [, switchTool] = createElectronTools(manager, automation);
        await switchTool!.execute({ windowId: 'win-0' });

        expect(automation.setAttachedPage).toHaveBeenCalledWith(win1.page);
    });
});
