/**
 * Centralized defaults for platform connectivity, viewport,
 * and browser management.
 *
 * Consumed by PlatformConstants.ts, config-types.ts,
 * BrowserPool, ElectronDriver, electron/main.ts,
 * PlaywrightAdapter, PlaywrightPerceptionSource, and AriaSensor.
 *
 * ⚠️  Node-only constants (e.g. DEFAULT_PLUGIN_DIR) live in
 *     plugin.defaults.ts and are NOT barrel-exported, so this
 *     file stays safe for the Vite renderer bundle.
 */

// ── Viewport ─────────────────────────────────────────────────────────

/** Default viewport width for web sessions. */
export const DEFAULT_VIEWPORT_WIDTH = 1280;

/** Default viewport height for web sessions. */
export const DEFAULT_VIEWPORT_HEIGHT = 720;

/** Electron agent-view window width. */
export const AGENT_VIEW_WIDTH = 1200;

/** Electron agent-view window height. */
export const AGENT_VIEW_HEIGHT = 800;

// ── CDP / Electron ───────────────────────────────────────────────────

/** Default remote debugging port for Chromium / CDP connections. */
export const CDP_DEFAULT_PORT = 9222;

/** Default CDP host. */
export const CDP_DEFAULT_HOST = 'localhost';

/** Default CDP URL string. */
export const CDP_DEFAULT_URL = `http://${CDP_DEFAULT_HOST}:${CDP_DEFAULT_PORT}`;

/** Default Electron remote debugging port (Domia shell). */
export const ELECTRON_DEBUG_PORT = '21223';

/** Default Appium server URL. */
export const DEFAULT_APPIUM_URL = 'http://localhost:4723';

// ── Timeouts ─────────────────────────────────────────────────────────

/** Timeout for CDP connection attempts (ms). */
export const CDP_CONNECTION_TIMEOUT_MS = 30_000;

/** Timeout waiting for a target window to appear after connection (ms). */
export const WINDOW_WAIT_TIMEOUT_MS = 5_000;

/** Interval between window polling checks (ms). */
export const WINDOW_POLL_INTERVAL_MS = 500;

/** Timeout for page content-ready checks (waitForContentReady / AriaSensor). */
export const CONTENT_READY_TIMEOUT_MS = 5_000;

/** Browser idle timeout before auto-close in the pool (ms). */
export const BROWSER_IDLE_TIMEOUT_MS = 60_000;

// ── Browser launch ───────────────────────────────────────────────────

/** Default Chromium launch arguments. */
export const CHROMIUM_LAUNCH_ARGS: readonly string[] = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
];

// ── Screenshot quality ───────────────────────────────────────────────

/** Default JPEG quality for perception screenshots. */
export const DEFAULT_SCREENSHOT_QUALITY = 60;

// ── Scroll capture ───────────────────────────────────────────────────

/** Default max screenshots per scroll-capture pass. */
export const DEFAULT_MAX_SCROLL_SCREENSHOTS = 3;

/** Pixel overlap between consecutive scroll-capture screenshots. */
export const SCROLL_OVERLAP_PX = 100;

/** JPEG quality for CDP-based scroll-capture screenshots. */
export const SCROLL_CAPTURE_QUALITY = 60;

// ── Navigation ───────────────────────────────────────────────────────

/** Scroll amount in pixels for scroll actions. */
export const SCROLL_AMOUNT_PX = 500;

/** Timeout for navigation actions (ms). */
export const NAVIGATION_TIMEOUT_MS = 30_000;

/** Timeout for element wait operations (ms). */
export const ELEMENT_WAIT_TIMEOUT_MS = 10_000;

/** Duration for element highlight overlay (ms). */
export const HIGHLIGHT_DURATION_MS = 1_000;

// ── Window scoring ───────────────────────────────────────────────────

/** Penalty applied to devtools or extension windows during selection. */
export const WINDOW_SCORE_DEVTOOLS_PENALTY = 100;

/** Penalty for about:blank or chrome:// URLs. */
export const WINDOW_SCORE_BLANK_PENALTY = 20;

/** Bonus for file://, http://, or https:// URLs. */
export const WINDOW_SCORE_PROTOCOL_BONUS = 10;

/** Bonus for windows with a meaningful title. */
export const WINDOW_SCORE_TITLE_BONUS = 5;

/** Bonus for titles containing "domia" or "agent". */
export const WINDOW_SCORE_DOMIA_BONUS = 10;

// ── Plugins ──────────────────────────────────────────────────────────
// DEFAULT_PLUGIN_DIR moved to plugin.defaults.ts (Node-only, not barrel-exported).
