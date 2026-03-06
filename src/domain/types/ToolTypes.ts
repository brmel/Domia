/**
 * Canonical set of tool names shipped with Domia.
 * This is the single source of truth — keep in sync with the tool catalogs.
 * Plugin tools extend this via the open `ToolName` union below.
 */
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

/**
 * Open union: built-in names with IDE autocomplete, plus any plugin-defined
 * name. Structurally equivalent to `string` at runtime — agent workflow is
 * never constrained.
 */
export type ToolName = BuiltInToolName | (string & {});

/**
 * Semantic grouping of a tool. Used for documentation, filtering, and
 * recording opt-in decisions. If a tool has no category it is still valid.
 */
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

/**
 * The value returned by every tool's `execute` function.
 * Deliberately kept as an open record so agent frameworks can add arbitrary
 * fields (e.g. ADK metadata). Use `toolSuccess` / `toolError` helpers to
 * construct well-shaped results.
 */
export type ToolResult = Record<string, unknown>;
