/**
 * Centralized defaults for all agent tools.
 *
 * Consumed by observation.tools.ts, polling.tools.ts,
 * snapshot-recording.tools.ts, ActionMapper, and validation.ts.
 *
 * To expose a constant in CLI/UI, add it to DomiaConfigSchema in
 * `src/shared/config-types.ts`.
 */

// ── Wait tool ────────────────────────────────────────────────────────

/** Default duration for the `wait` tool (ms). */
export const DEFAULT_WAIT_DURATION_MS = 1000;

// ── Polling / waitForCondition ───────────────────────────────────────

/** Maximum total polling duration (10 minutes). */
export const MAX_POLL_DURATION_MS = 10 * 60 * 1000;

/** Smallest accepted poll interval (ms). */
export const MIN_POLL_INTERVAL_MS = 200;

/** Largest accepted poll interval (ms). */
export const MAX_POLL_INTERVAL_MS = 30_000;

/** Default poll interval (ms). */
export const DEFAULT_POLL_INTERVAL_MS = 2_000;

/** Default polling timeout before giving up (ms). */
export const DEFAULT_POLL_TIMEOUT_MS = 30_000;

/** Max chars of the snapshot returned on timeout. */
export const POLL_TIMEOUT_SNAPSHOT_CHARS = 500;

// ── Observation / extract ────────────────────────────────────────────

/** Max characters returned by the `extract` tool. */
export const MAX_EXTRACT_TEXT_LENGTH = 400;

// ── Snapshot recording (DOM mutation) ────────────────────────────────

/** Maximum mutation log entries kept in the recording buffer. */
export const MAX_MUTATION_LOG_ENTRIES = 50_000;

/** Maximum unique values returned in a recording summary. */
export const MAX_RECORDING_UNIQUE_VALUES = 2_000;

/** Number of timeline entries returned in a condensed recording summary. */
export const RECORDING_TIMELINE_ENTRIES = 60;

// ── Action recording (screenshot frames) ─────────────────────────────

/** Default max recording duration per action (ms). */
export const DEFAULT_RECORDING_MAX_DURATION_MS = 100;

/** Default interval between recording frames (ms). ~40 fps. */
export const DEFAULT_RECORDING_INTERVAL_MS = 25;

/** Default JPEG quality for action recording frames (1-100). */
export const DEFAULT_RECORDING_QUALITY = 40;

/** Minimum allowed recording duration (ms) — validation bound. */
export const MIN_RECORDING_DURATION_MS = 10;

/** Maximum allowed recording duration (ms) — validation bound. */
export const MAX_RECORDING_DURATION_MS = 5000;

/** Maximum allowed recording interval (ms) — validation bound. */
export const MAX_RECORDING_INTERVAL_MS = 1000;

// ── Shell tool ───────────────────────────────────────────────────────

/** Default timeout for shell_exec commands (ms). */
export const DEFAULT_SHELL_TIMEOUT_MS = 30_000;

/** Max characters of stdout/stderr returned to the agent. */
export const MAX_SHELL_OUTPUT_LENGTH = 4096;
