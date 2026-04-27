export const ToolName = {
    Click: 'click',
    Type: 'type',
    Hover: 'hover',
    SelectOption: 'selectOption',
    DragTo: 'dragTo',
    PressKey: 'pressKey',
    MouseMove: 'mouse_move',
    MouseClickLeft: 'mouse_click_left',
    MouseClickRight: 'mouse_click_right',
    MouseDoubleClick: 'mouse_double_click',
    MouseDrag: 'mouse_drag',
    MouseScroll: 'mouse_scroll',
    Navigate: 'navigate',
    Scroll: 'scroll',
    Observe: 'observe',
    Extract: 'extract',
    Wait: 'wait',
    WaitForCondition: 'waitForCondition',
    WaitForUrl: 'wait_for_url',
    StartRecording: 'startRecording',
    StopAndReviewRecording: 'stopAndReviewRecording',
    ShellExec: 'shell_exec',
    ListWindows: 'list_windows',
    SwitchWindow: 'switch_window',
    OpenTab: 'open_tab',
    ListBrowserTabs: 'list_browser_tabs',
    SwitchBrowserTab: 'switch_browser_tab',
    CloseBrowserTab: 'close_browser_tab',
    Finish: 'finish',
} as const;
export type BuiltInToolName = typeof ToolName[keyof typeof ToolName];

export type ToolNameValue = BuiltInToolName | (string & {});

export const ToolCategory = {
    Interaction: 'interaction',
    Mouse: 'mouse',
    Navigation: 'navigation',
    Observation: 'observation',
    Terminal: 'terminal',
    Polling: 'polling',
    Recording: 'recording',
    Shell: 'shell',
    Electron: 'electron',
} as const;
export type ToolCategory = typeof ToolCategory[keyof typeof ToolCategory];

export type ToolResult = Record<string, unknown>;
