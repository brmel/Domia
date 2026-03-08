import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ok, err } from 'neverthrow';
import { createElectronTools } from '@infrastructure/tools/catalog/electron.tools';
import type { ElectronWindowManager, ElectronWindow } from '@infrastructure/drivers/ElectronWindowManager';
import { ActionType } from '@domain/enums';
import { ValidationError } from '@domain/errors';

function makeWindow(id: string, title: string, url: string): ElectronWindow {
    return { id, page: {} as import('playwright').Page, title, url };
}

function makeWindowManager(windows: ElectronWindow[], activeId?: string): ElectronWindowManager {
    const activeWindow = activeId ? windows.find(w => w.id === activeId) ?? null : windows[0] ?? null;

    return {
        getAllWindows: vi.fn(() => windows),
        getActiveWindow: vi.fn(() => activeWindow),
        switchWindow: vi.fn(async (id: string) => {
            const found = windows.find(w => w.id === id);
            return found ? ok(found) : err(new ValidationError(`Window ${id} not found`, 'windowId'));
        }),
    } as unknown as ElectronWindowManager;
}

describe('createElectronTools', () => {
    it('returns exactly two tools: list_windows and switch_window', () => {
        const tools = createElectronTools(makeWindowManager([]));
        expect(tools).toHaveLength(2);
        expect(tools[0]!.name).toBe('list_windows');
        expect(tools[1]!.name).toBe('switch_window');
    });

    it('tools have correct actionTypes', () => {
        const tools = createElectronTools(makeWindowManager([]));
        expect(tools[0]!.actionType).toBe(ActionType.LIST_WINDOWS);
        expect(tools[1]!.actionType).toBe(ActionType.SWITCH_WINDOW);
    });

    it('tools are scoped to the electron platform', () => {
        const tools = createElectronTools(makeWindowManager([]));
        for (const tool of tools) {
            expect(tool.platforms).toEqual(['electron']);
        }
    });
});

describe('list_windows tool', () => {
    it('returns empty list when no windows are registered', () => {
        const [listTool] = createElectronTools(makeWindowManager([]));
        const result = listTool!.execute({}) as { windows: unknown[]; count: number };

        expect(result.windows).toEqual([]);
        expect(result.count).toBe(0);
    });

    it('lists all registered windows with id, title, url, and active flag', () => {
        const win1 = makeWindow('win-0', 'Main', 'https://app.example.com');
        const win2 = makeWindow('win-1', 'Settings', 'https://app.example.com/settings');
        const manager = makeWindowManager([win1, win2], 'win-0');

        const [listTool] = createElectronTools(manager);
        const result = listTool!.execute({}) as { windows: Array<Record<string, unknown>>; count: number };

        expect(result.count).toBe(2);
        expect(result.windows[0]).toMatchObject({ id: 'win-0', title: 'Main', active: true });
        expect(result.windows[1]).toMatchObject({ id: 'win-1', title: 'Settings', active: false });
    });

    it('marks only the active window with active: true', () => {
        const win1 = makeWindow('win-0', 'A', 'https://a.com');
        const win2 = makeWindow('win-1', 'B', 'https://b.com');
        const manager = makeWindowManager([win1, win2], 'win-1');

        const [listTool] = createElectronTools(manager);
        const result = listTool!.execute({}) as { windows: Array<{ active: boolean }> };

        expect(result.windows[0]!.active).toBe(false);
        expect(result.windows[1]!.active).toBe(true);
    });
});

describe('switch_window tool', () => {
    it('switches to the requested window via windowManager.switchWindow', async () => {
        const win1 = makeWindow('win-0', 'Main', 'https://app.com');
        const win2 = makeWindow('win-1', 'Settings', 'https://app.com/settings');
        const manager = makeWindowManager([win1, win2], 'win-0');

        const [, switchTool] = createElectronTools(manager);
        const result = await switchTool!.execute({ windowId: 'win-1' }) as Record<string, unknown>;

        expect(manager.switchWindow).toHaveBeenCalledWith('win-1');
        expect(result['windowId']).toBe('win-1');
        expect(result['title']).toBe('Settings');
    });

    it('returns error when trying to switch to a non-existent window', async () => {
        const manager = makeWindowManager([], undefined);

        const [, switchTool] = createElectronTools(manager);
        const result = await switchTool!.execute({ windowId: 'win-99' }) as { status: string; error: string };

        expect(result.status).toBe('error');
        expect(result.error).toContain('win-99');
    });
});
