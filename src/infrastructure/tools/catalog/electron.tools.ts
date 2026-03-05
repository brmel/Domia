import { z } from 'zod';
import { ActionType } from '@domain/enums/ActionType';
import type { IStructuredAutomation } from '@domain/ports';
import type { ToolSpec } from '../ToolSpec';
import type { ElectronWindowManager } from '../../drivers/ElectronWindowManager';
import { toolSuccess, toolError, errorMsg } from '../toolResult';

interface PageAttachable {
    setAttachedPage(page: import('playwright').Page): void;
}

function isPageAttachable(obj: unknown): obj is PageAttachable {
    return typeof obj === 'object' && obj !== null && typeof (obj as PageAttachable).setAttachedPage === 'function';
}

export function createElectronTools(windowManager: ElectronWindowManager, automation: IStructuredAutomation): ToolSpec[] {
    return [
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

                const result = windowManager.setActiveWindow(windowId);
                if (result.isErr()) {
                    return toolError(result.error.message);
                }

                const win = windowManager.getActiveWindow();
                if (!win) {
                    return toolError('Window set but could not retrieve active window');
                }

                try {
                    await win.page.bringToFront();
                } catch (e) {
                    return toolError(`Switched but failed to bring window to front: ${errorMsg(e)}`);
                }

                if (isPageAttachable(automation)) {
                    automation.setAttachedPage(win.page);
                }

                return toolSuccess({
                    windowId: win.id,
                    title: win.title,
                    url: win.url,
                });
            },
        },
    ];
}
