/**
 * Abstraction over browser tab management.
 * Implemented by PlaywrightAdapter for web runs; not available on non-DOM
 * platforms. Inject via ToolDependencies.tabManager (optional).
 */

export interface TabInfo {
    /** Zero-based index in the current browser context. */
    readonly index: number;
    readonly url: string;
    readonly title: string;
    /** True if this is the currently focused/active tab. */
    readonly active: boolean;
}

export interface ITabManager {
    /** Open a new browser tab, optionally navigating to url. Returns the new tab's info. */
    newTab(url?: string): Promise<TabInfo>;
    /** List all open tabs in the current browser context. */
    listTabs(): Promise<TabInfo[]>;
    /** Switch focus to the tab at the given index. All subsequent tool calls target this tab. */
    switchTab(index: number): Promise<TabInfo>;
    /** Close the tab at index, or the currently active tab if no index is provided. */
    closeTab(index?: number): Promise<void>;
}
