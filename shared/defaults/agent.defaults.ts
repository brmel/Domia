export const DEFAULT_LLM_MODEL = 'gemini-2.0-flash';
export const DEFAULT_LLM_PROVIDER = 'google' as const;
export const LLM_CALL_BUDGET_OFFSET = 2;

export const DEFAULT_MAX_ACTIONS = 50;
export const DEFAULT_MAX_DURATION_MS = 15 * 60 * 1000;
export const DEFAULT_MAX_ESTIMATED_TOKENS = 120_000;
export const DEFAULT_DELAY_BETWEEN_STEPS_MS = 1000;



export const CLI_DEFAULT_STEPS = 10;
export const CLI_DEFAULT_LIST_LIMIT = 20;
export const CLI_DEFAULT_URL = 'https://ibraverse.ca';


export const CONFIG_FILE_NAME = 'domia.config.json';

export const DEFAULT_RETRY_ATTEMPTS = 3;
export const DEFAULT_RETRY_MIN_DELAY_MS = 300;
export const DEFAULT_RETRY_MAX_DELAY_MS = 30_000;

export const RunSummaryDefaults = {
    Completed: 'Completed successfully',
    CancelledByUser: 'Cancelled by user.',
    UnknownFailure: 'Unknown error',
    UnknownOutcome: 'Unknown outcome',
} as const;
