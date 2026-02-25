export enum Platform {
    WEB = 'web',
    ELECTRON = 'electron',
}

export const CDP_CONSTANTS = {
    DEFAULT_PORT: 9222,
    DEFAULT_HOST: 'localhost',
    DEFAULT_URL: 'http://localhost:9222',
    CONNECTION_TIMEOUT_MS: 30000,
    WINDOW_WAIT_TIMEOUT_MS: 5000,
    WINDOW_POLL_INTERVAL_MS: 500
} as const;

export const TOOL_TIMEOUTS = {
    CLICK_MS: 5000,
    TYPE_MS: 5000,
    NAVIGATION_MS: 30000,
    ELEMENT_WAIT_MS: 10000,
    DEFAULT_SCREENSHOT_TIMEOUT_MS: 30000,
    CDP_RETRY_DELAY_MS: 1000,
    HIGHLIGHT_DURATION_MS: 1000
} as const;

export const SCROLL_CONSTANTS = {
    AMOUNT_PX: 500,
    SMOOTH_BEHAVIOR: false
} as const;

export const WINDOW_ID_CONSTANTS = {
    PREFIX: 'electron-window',
    SEPARATOR: '-'
} as const;

export const AGENT_VIEW_CONFIG = {
    DEFAULT_WIDTH: 1200,
    DEFAULT_HEIGHT: 800,
} as const;
