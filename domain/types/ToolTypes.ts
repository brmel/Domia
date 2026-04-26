export type BuiltInToolName =
    | 'click' | 'type' | 'hover' | 'selectOption' | 'dragTo' | 'pressKey'
    | 'mouse_move' | 'mouse_click_left' | 'mouse_click_right'
    | 'mouse_double_click' | 'mouse_drag' | 'mouse_scroll'
    | 'navigate' | 'scroll'
    | 'observe' | 'extract' | 'wait'
    | 'waitForCondition'
    | 'startRecording' | 'stopAndReviewRecording'
    | 'shell_exec'
    | 'list_windows' | 'switch_window'
    | 'open_tab' | 'list_browser_tabs' | 'switch_browser_tab' | 'close_browser_tab'
    | 'finish';

export type ToolName = BuiltInToolName | (string & {});

export type ToolCategory =
    | 'interaction'
    | 'mouse'
    | 'navigation'
    | 'observation'
    | 'terminal'
    | 'polling'
    | 'recording'
    | 'shell'
    | 'electron';

export type ToolResult = Record<string, unknown>;
