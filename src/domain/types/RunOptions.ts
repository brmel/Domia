export interface RunOptions {
    headless?: boolean | undefined;
    maxSteps?: number | undefined;
    maxDurationMs?: number | undefined;
    maxEstimatedTokens?: number | undefined;
    maxRetries?: number | undefined;
    provider?: string | undefined;
    verbose?: boolean | undefined;
    debug?: boolean | undefined;
    vision?: boolean | undefined;
    debugScreenshots?: boolean | undefined;
    recoveryMode?: 'observe' | 'manual-only' | 'auto-safe' | undefined;
    recoveryRunId?: string | undefined;
    readinessMode?: 'observe' | 'soft-enforce' | undefined;
    readinessProfile?: 'dev' | 'staging' | 'production' | undefined;
}
