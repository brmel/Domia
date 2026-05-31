import { z } from 'zod';
import { ActionType } from '@domain/enums';
import type { ITabManager } from '@domain/ports/automation/ITabManager';
import type { ToolSpec } from '../ToolSpec';
import { toolSuccess, toolError, errorMsg } from '../toolResult';

export function createTabTools(tabManager: ITabManager): ToolSpec[] {
    return [
        {
            name: 'open_tab',
            category: 'navigation' as const,
            description: 'Open a new browser tab. Optionally navigate to a URL in the new tab. The new tab becomes the active one — all subsequent actions target it. Use to work across multiple sites simultaneously, open links in the background, or isolate context. Input: { url?: string }. Output: { status: "success", index, url, title } or { status: "error", error: string }.',
            actionType: ActionType.OPEN_TAB,
            platforms: ['web'] as const,
            parameters: z.object({
                url: z.string().optional().describe('URL to navigate in the new tab (include protocol, e.g. https://example.com). Leave empty to open a blank tab.'),
            }),
            execute: async (args) => {
                try {
                    const tab = await tabManager.newTab(args['url'] as string | undefined);
                    return toolSuccess({ index: tab.index, url: tab.url, title: tab.title });
                } catch (e) {
                    return toolError(errorMsg(e));
                }
            },
        },
        {
            name: 'list_browser_tabs',
            category: 'navigation' as const,
            description: 'List all currently open browser tabs with their index, URL, title, and which is active. Use before switch_browser_tab to find the right index. Input: {}. Output: { status: "success", tabs: Array<{ index, url, title, active }>, count: number }.',
            actionType: ActionType.LIST_BROWSER_TABS,
            platforms: ['web'] as const,
            parameters: z.object({}),
            execute: async () => {
                try {
                    const tabs = await tabManager.listTabs();
                    return toolSuccess({ tabs, count: tabs.length });
                } catch (e) {
                    return toolError(errorMsg(e));
                }
            },
        },
        {
            name: 'switch_browser_tab',
            category: 'navigation' as const,
            description: 'Switch focus to a browser tab by its index (from list_browser_tabs). All subsequent actions target the switched-to tab. Input: { index: number }. Output: { status: "success", index, url, title } or { status: "error", error: string }.',
            actionType: ActionType.SWITCH_BROWSER_TAB,
            platforms: ['web'] as const,
            parameters: z.object({
                index: z.number().int().nonnegative().describe('Zero-based tab index from list_browser_tabs.'),
            }),
            execute: async (args) => {
                try {
                    const tab = await tabManager.switchTab(args['index'] as number);
                    return toolSuccess({ index: tab.index, url: tab.url, title: tab.title });
                } catch (e) {
                    return toolError(errorMsg(e));
                }
            },
        },
        {
            name: 'close_browser_tab',
            category: 'navigation' as const,
            description: 'Close a browser tab by its index, or close the currently active tab if no index is given. After closing, use list_browser_tabs to see remaining tabs and switch_browser_tab to re-focus. Input: { index?: number }. Output: { status: "success" } or { status: "error", error: string }.',
            actionType: ActionType.CLOSE_BROWSER_TAB,
            platforms: ['web'] as const,
            parameters: z.object({
                index: z.number().int().nonnegative().optional().describe('Tab index to close. Defaults to the active tab.'),
            }),
            execute: async (args) => {
                try {
                    await tabManager.closeTab(args['index'] as number | undefined);
                    return toolSuccess();
                } catch (e) {
                    return toolError(errorMsg(e));
                }
            },
        },
    ];
}
