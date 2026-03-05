/**
 * Centralized defaults for agent-level design decisions.
 *
 * Every constant here is a tuning knob for how the agent reasons,
 * plans, and budgets its actions.  They are consumed by
 * DomiaConfigSchema, RunBudgetPolicyService, AgentLoopGuard,
 * ReplanningPolicyService, and the CLI/UI options layer.
 *
 * To expose a constant in CLI/UI, add it to DomiaConfigSchema in
 * `src/shared/config-types.ts`.
 */

// ── LLM ──────────────────────────────────────────────────────────────

/** Default Gemini model when none is configured. */
export const DEFAULT_LLM_MODEL = 'gemini-2.0-flash';

/** Default LLM provider. */
export const DEFAULT_LLM_PROVIDER = 'google' as const;

/** Extra LLM calls over maxActions the ADK runner is allowed (tool-result round-trips). */
export const LLM_CALL_BUDGET_OFFSET = 2;

// ── Execution budget ─────────────────────────────────────────────────

/** Default maximum agent actions per step / run. */
export const DEFAULT_MAX_ACTIONS = 20;

/** Default maximum run wall-clock duration (15 min). */
export const DEFAULT_MAX_DURATION_MS = 15 * 60 * 1000;

/** Default estimated-token budget per run. */
export const DEFAULT_MAX_ESTIMATED_TOKENS = 120_000;

/** Default delay between workflow steps (ms). */
export const DEFAULT_DELAY_BETWEEN_STEPS_MS = 1000;

// ── Replanning ───────────────────────────────────────────────────────

/** How many times the planner may replan within a single run. */
export const DEFAULT_MAX_REPLANS_PER_RUN = 2;

// ── Loop guard ───────────────────────────────────────────────────────

/** Consecutive identical tool calls before declaring a loop. */
export const DEFAULT_LOOP_GUARD_THRESHOLD = 3;

// ── CLI interactive defaults ─────────────────────────────────────────

/** Default steps shown in CLI interactive prompt / help text. */
export const CLI_DEFAULT_STEPS = 10;

/** Default list/query limit shown in CLI subcommands. */
export const CLI_DEFAULT_LIST_LIMIT = 20;

/** Default URL offered when no target is provided interactively. */
export const CLI_DEFAULT_URL = 'https://ibraverse.ca';

// ── Config file ──────────────────────────────────────────────────────

/** Canonical config file name used by cosmiconfig and fallback path. */
export const CONFIG_FILE_NAME = 'domia.config.json';

// ── Retry defaults ───────────────────────────────────────────────────

/** Default number of retry attempts. */
export const DEFAULT_RETRY_ATTEMPTS = 3;

/** Default minimum delay between retries (ms). */
export const DEFAULT_RETRY_MIN_DELAY_MS = 300;

/** Default maximum delay between retries (ms). */
export const DEFAULT_RETRY_MAX_DELAY_MS = 30_000;
