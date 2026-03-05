/**
 * Centralized defaults for persistence layer.
 *
 * Consumed by SQLiteRunRepository, SQLiteWorkflowRepository,
 * SQLiteAdapter, and CheckpointCompactionService.
 */

// ── Query limits ─────────────────────────────────────────────────────

/** Default limit for `getRuns` queries. */
export const DEFAULT_RUNS_QUERY_LIMIT = 50;

/** Default limit for `getWorkflowDefinitions` / `getWorkflowRuns` queries. */
export const DEFAULT_WORKFLOWS_QUERY_LIMIT = 100;

// ── Checkpoint compaction ────────────────────────────────────────────

/** Keep every Nth checkpoint in compacted view. */
export const CHECKPOINT_KEEP_EVERY_NTH = 5;

/** Number of most-recent checkpoints always kept. */
export const CHECKPOINT_MAX_RECENT = 20;

// ── Paths ────────────────────────────────────────────────────────────

/** Default artifacts directory. */
export const DEFAULT_ARTIFACTS_DIR = './artifacts';

/** Default database file path. */
export const DEFAULT_DATABASE_PATH = './domia.db';
