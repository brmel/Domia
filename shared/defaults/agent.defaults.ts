export const DEFAULT_LLM_MODEL = 'gemini-2.5-flash';
export const DEFAULT_LLM_PROVIDER = 'google' as const;
export const LLM_CALL_BUDGET_OFFSET = 2;

export const DEFAULT_AGENT_TEMPERATURE = 0;
/** Gemini thinking token budget; 0 = disabled. Opt in per-run via DOMIA_THINKING_BUDGET. */
export const DEFAULT_THINKING_BUDGET = 0;

export const DEFAULT_MAX_ACTIONS = 1000;
export const DEFAULT_MAX_DURATION_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_MAX_ESTIMATED_TOKENS = 2_000_000;



export const CLI_DEFAULT_STEPS = 10;
export const CLI_DEFAULT_LIST_LIMIT = 20;
export const CLI_DEFAULT_URL = 'https://ibraverse.ca';


export const CONFIG_FILE_NAME = 'domia.config.json';

export const LLM_ERROR_RETRIES = 2;

export const DEFAULT_RETRY_ATTEMPTS = 3;
export const DEFAULT_RETRY_MIN_DELAY_MS = 300;
export const DEFAULT_RETRY_MAX_DELAY_MS = 30_000;

export const RunSummaryDefaults = {
    Completed: 'Completed successfully',
    CancelledByUser: 'Cancelled by user.',
    UnknownFailure: 'Unknown error',
    UnknownOutcome: 'Unknown outcome',
} as const;
