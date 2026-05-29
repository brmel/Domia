import { z } from 'zod';
import { ActionType } from '@domain/enums';
import type { ToolSpec } from '../ToolSpec';
import type { IWindowManager } from '@domain/ports/IWindowManager';
import { toolSuccess, toolError } from '../toolResult';

export function createElectronTools(windowManager: IWindowManager): ToolSpec[] {
    return ([
        {
            name: 'list_windows',
            description: 'List all open Electron application windows with their IDs, titles, and URLs. Use this to discover available windows before switching.',
            actionType: ActionType.LIST_WINDOWS,
            parameters: z.object({}),
            platforms: ['electron'],
            execute: () => {
                const windows = windowManager.getAllWindows();
                const activeWindow = windowManager.getActiveWindow();
                return toolSuccess({
                    windows: windows.map((w) => ({
                        id: w.id,
                        title: w.title,
                        url: w.url,
                        active: w.id === activeWindow?.id,
                    })),
                    count: windows.length,
                });
            },
        },
        {
            name: 'switch_window',
            description: 'Switch the active Electron window by its ID. Use list_windows first to discover available window IDs. After switching, all subsequent actions target the new window.',
            actionType: ActionType.SWITCH_WINDOW,
            parameters: z.object({
                windowId: z.string().describe('The window ID to switch to (from list_windows output).'),
            }),
            platforms: ['electron'],
            execute: async (args) => {
                const windowId = args['windowId'] as string;

                const result = await windowManager.switchWindow(windowId);
                if (result.isErr()) {
                    return toolError(result.error.message);
                }

                const win = result.value;
                return toolSuccess({
                    windowId: win.id,
                    title: win.title,
                    url: win.url,
                });
            },
        },
    ] as ToolSpec[]).map(spec => ({ ...spec, category: 'electron' as const }));
}
