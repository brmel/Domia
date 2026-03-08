// ── Viewport ─────────────────────────────────────────────────────────

export const DEFAULT_VIEWPORT_WIDTH = 1280;
export const DEFAULT_VIEWPORT_HEIGHT = 720;
export const AGENT_VIEW_WIDTH = 1200;
export const AGENT_VIEW_HEIGHT = 800;

// ── CDP / Electron ───────────────────────────────────────────────────

export const CDP_DEFAULT_PORT = 9222;
export const CDP_DEFAULT_HOST = 'localhost';
export const CDP_DEFAULT_URL = `http://${CDP_DEFAULT_HOST}:${CDP_DEFAULT_PORT}`;
export const ELECTRON_DEBUG_PORT = '21223';
export const DEFAULT_APPIUM_URL = 'http://localhost:4723';

// ── Timeouts ─────────────────────────────────────────────────────────

export const CDP_CONNECTION_TIMEOUT_MS = 30_000;
export const WINDOW_WAIT_TIMEOUT_MS = 5_000;
export const WINDOW_POLL_INTERVAL_MS = 500;
export const CONTENT_READY_TIMEOUT_MS = 5_000;
export const BROWSER_IDLE_TIMEOUT_MS = 60_000;

// ── Browser launch ───────────────────────────────────────────────────

export const CHROMIUM_LAUNCH_ARGS: readonly string[] = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
];

// ── Screenshot quality ───────────────────────────────────────────────

export const DEFAULT_SCREENSHOT_QUALITY = 60;

// ── Scroll capture ───────────────────────────────────────────────────

export const DEFAULT_MAX_SCROLL_SCREENSHOTS = 3;
export const SCROLL_OVERLAP_PX = 100;
export const SCROLL_CAPTURE_QUALITY = 60;

// ── Navigation ───────────────────────────────────────────────────────

export const SCROLL_AMOUNT_PX = 500;
export const NAVIGATION_TIMEOUT_MS = 30_000;
export const ELEMENT_WAIT_TIMEOUT_MS = 10_000;
export const HIGHLIGHT_DURATION_MS = 1_000;

// ── Window scoring ───────────────────────────────────────────────────

export const WINDOW_SCORE_DEVTOOLS_PENALTY = 100;
export const WINDOW_SCORE_BLANK_PENALTY = 20;
export const WINDOW_SCORE_PROTOCOL_BONUS = 10;
export const WINDOW_SCORE_TITLE_BONUS = 5;
export const WINDOW_SCORE_DOMIA_BONUS = 10;

// ── Plugins ──────────────────────────────────────────────────────────
// DEFAULT_PLUGIN_DIR moved to plugin.defaults.ts (Node-only, not barrel-exported).
