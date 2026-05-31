export interface TabInfo {
    readonly index: number;
    readonly url: string;
    readonly title: string;
    readonly active: boolean;
}

export interface ITabManager {
    newTab(url?: string): Promise<TabInfo>;
    listTabs(): Promise<TabInfo[]>;
    switchTab(index: number): Promise<TabInfo>;
    closeTab(index?: number): Promise<void>;
}
