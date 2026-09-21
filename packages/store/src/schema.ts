/** One baseline schema (pre-1.0: no migrations — delete the db to recreate). */
export const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, target_json TEXT NOT NULL,
  request_template TEXT, assets_json TEXT NOT NULL, constraints_json TEXT NOT NULL,
  tool_policy_json TEXT NOT NULL, tags_json TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL, parent_run_id TEXT,
  persona TEXT NOT NULL, status TEXT NOT NULL, request TEXT NOT NULL,
  options_json TEXT NOT NULL, report_json TEXT,
  started_at TEXT NOT NULL, ended_at TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id)
);
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL UNIQUE, goal TEXT NOT NULL,
  revision INTEGER NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id)
);
CREATE TABLE IF NOT EXISTS plan_items (
  id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, seq INTEGER NOT NULL,
  title TEXT NOT NULL, intent TEXT NOT NULL, status TEXT NOT NULL, note TEXT,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);
CREATE TABLE IF NOT EXISTS plan_revisions (
  plan_id TEXT NOT NULL, revision INTEGER NOT NULL, op_json TEXT NOT NULL,
  origin TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (plan_id, revision)
);
CREATE TABLE IF NOT EXISTS exchanges (
  run_id TEXT NOT NULL, seq INTEGER NOT NULL, direction TEXT NOT NULL,
  payload_json TEXT NOT NULL, usage_json TEXT, at TEXT NOT NULL,
  PRIMARY KEY (run_id, seq), FOREIGN KEY (run_id) REFERENCES runs(id)
);
CREATE TABLE IF NOT EXISTS trace_spans (
  span_id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, parent_span_id TEXT,
  run_id TEXT, name TEXT NOT NULL, attrs_json TEXT NOT NULL, status TEXT NOT NULL,
  cost_json TEXT, started_at TEXT NOT NULL, ended_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trace_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, span_id TEXT, run_id TEXT,
  name TEXT NOT NULL, attrs_json TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY, run_id TEXT, kind TEXT NOT NULL, mime TEXT NOT NULL,
  bytes INTEGER NOT NULL, sha256 TEXT NOT NULL UNIQUE, path TEXT NOT NULL,
  label TEXT, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS snapshots (
  run_id TEXT PRIMARY KEY, provider TEXT NOT NULL, blob_path TEXT NOT NULL, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL, title TEXT NOT NULL, tags_json TEXT NOT NULL,
  body_path TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL, cron TEXT NOT NULL, request TEXT NOT NULL,
  options_json TEXT NOT NULL, enabled INTEGER NOT NULL, last_run_id TEXT, next_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings ( key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL );

CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status, started_at);
CREATE INDEX IF NOT EXISTS idx_runs_case ON runs(case_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_run ON exchanges(run_id, seq);
CREATE INDEX IF NOT EXISTS idx_spans_run ON trace_spans(run_id);
CREATE INDEX IF NOT EXISTS idx_memories_case ON memories(case_id);
CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled, next_at);
CREATE INDEX IF NOT EXISTS idx_runs_parent ON runs(parent_run_id);
CREATE INDEX IF NOT EXISTS idx_plan_items_plan ON plan_items(plan_id, seq);
CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts(run_id);
`;
