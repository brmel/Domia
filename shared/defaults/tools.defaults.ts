
export const DEFAULT_WAIT_DURATION_MS = 1000;
export const DEFAULT_RECALL_WINDOW_MS = 5000;

export const MIN_POLL_INTERVAL_MS = 200;
export const MAX_POLL_INTERVAL_MS = 30_000;
export const DEFAULT_POLL_INTERVAL_MS = 2_000;
export const DEFAULT_POLL_TIMEOUT_MS = 30_000;
export const POLL_TIMEOUT_SNAPSHOT_CHARS = 500;

export const MAX_EXTRACT_TEXT_LENGTH = 2000;
export const MAX_PAGE_CONTENT_LENGTH = 16_000;

export const MAX_MUTATION_LOG_ENTRIES = 50_000;
export const MAX_RECORDING_UNIQUE_VALUES = 2_000;
export const RECORDING_TIMELINE_ENTRIES = 60;

export const DEFAULT_RECORDING_MAX_DURATION_MS = 100;
export const DEFAULT_RECORDING_INTERVAL_MS = 25;
export const DEFAULT_RECORDING_QUALITY = 40;
export const MIN_RECORDING_DURATION_MS = 10;
export const MAX_RECORDING_DURATION_MS = 5000;
export const MAX_RECORDING_INTERVAL_MS = 1000;


export const DEFAULT_SHELL_TIMEOUT_MS = 30_000;
export const MAX_SHELL_OUTPUT_LENGTH = 4096;
export const MAX_SHELL_ERROR_OUTPUT_CHARS = 500;

export const DEFAULT_SHELL_DENY_PATTERNS: readonly string[] = [
    'sudo\\b',
    'rm\\s+-[^\\s]*r[^\\s]*\\s+/',
    'mkfs\\b',
    'dd\\s+if=',
    ':\\(\\)\\{',
    'chmod\\s+777',
    '>\\.*/dev/sd',
    'shutdown\\b',
    'reboot\\b',
    'init\\s+[06]',
    'curl\\s[^|]*\\|\\s*(?:ba)?sh',
    'wget\\s[^|]*\\|\\s*(?:ba)?sh',
];

export const DEFAULT_REPORT_OUTPUT_DIR = './reports';
