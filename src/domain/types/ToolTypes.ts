export type BuiltInToolName =
    // Interaction (high-level Playwright element actions)
    | 'click' | 'type' | 'hover' | 'selectOption' | 'dragTo' | 'pressKey'
    // Mouse (low-level coordinate-based mouse actions)
    | 'mouse_move' | 'mouse_click_left' | 'mouse_click_right'
    | 'mouse_double_click' | 'mouse_drag' | 'mouse_scroll'
    // Navigation & scrolling
    | 'navigate' | 'scroll'
    // Observation & extraction
    | 'observe' | 'extract' | 'wait'
    // Polling
    | 'waitForCondition'
    // Snapshot recording
    | 'startRecording' | 'stopAndReviewRecording'
    // Shell
    | 'shell_exec'
    // Electron window management
    | 'list_windows' | 'switch_window'
    // Browser tab management
    | 'open_tab' | 'list_browser_tabs' | 'switch_browser_tab' | 'close_browser_tab'
    // Terminal (task outcome)
    | 'pass' | 'fail';

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
