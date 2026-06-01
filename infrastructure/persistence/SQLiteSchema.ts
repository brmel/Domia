import type { Database as SqlJsDatabase } from 'sql.js';

/**
 * Single baseline schema. Pre-release, so there is no migration history to carry:
 * this is the one authoritative `CREATE TABLE` set. `IF NOT EXISTS` keeps it
 * idempotent (safe to call twice / on an already-initialized DB). If the shape
 * changes before release, edit here and delete the local `domia.db` to re-create.
 */
export function initializeSchema(database: SqlJsDatabase): void {
    database.exec(`
        CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            url TEXT NOT NULL,
            status TEXT NOT NULL,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            duration_ms INTEGER,
            goal TEXT,
            summary TEXT,
            value_json TEXT,
            platform_config_json TEXT,
            parent_run_id TEXT,
            updated_at DATETIME
        );

        CREATE TABLE IF NOT EXISTS steps (
            id TEXT PRIMARY KEY,
            run_id TEXT NOT NULL,
            step_number INTEGER NOT NULL,
            action_type TEXT NOT NULL,
            action_payload JSON,
            assets_json JSON,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(run_id) REFERENCES runs(id)
        );

        CREATE TABLE IF NOT EXISTS workflow_checkpoints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT NOT NULL,
            checkpoint_id TEXT NOT NULL,
            state_json JSON NOT NULL,
            reason TEXT NOT NULL DEFAULT 'action_applied',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            metadata_json TEXT,
            FOREIGN KEY(run_id) REFERENCES runs(id)
        );

        CREATE TABLE IF NOT EXISTS workflow_definitions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL,
            version INTEGER NOT NULL,
            platform_config_json JSON NOT NULL,
            steps_json JSON NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workflow_runs (
            id TEXT PRIMARY KEY,
            workflow_definition_id TEXT NOT NULL,
            workflow_version INTEGER NOT NULL,
            status TEXT NOT NULL,
            summary TEXT,
            started_at DATETIME NOT NULL,
            completed_at DATETIME,
            FOREIGN KEY(workflow_definition_id) REFERENCES workflow_definitions(id)
        );

        CREATE TABLE IF NOT EXISTS workflow_step_runs (
            id TEXT PRIMARY KEY,
            workflow_run_id TEXT NOT NULL,
            step_id TEXT NOT NULL,
            step_index INTEGER NOT NULL,
            run_id TEXT,
            status TEXT NOT NULL,
            summary TEXT,
            started_at DATETIME NOT NULL,
            completed_at DATETIME,
            FOREIGN KEY(workflow_run_id) REFERENCES workflow_runs(id),
            FOREIGN KEY(run_id) REFERENCES runs(id)
        );

        CREATE TABLE IF NOT EXISTS skills (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            parameters_json JSON NOT NULL DEFAULT '[]',
            steps_json JSON NOT NULL,
            created_from_run_id TEXT,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);
        CREATE INDEX IF NOT EXISTS idx_runs_parent ON runs(parent_run_id);
        CREATE INDEX IF NOT EXISTS idx_steps_run_step ON steps(run_id, step_number);
        CREATE INDEX IF NOT EXISTS idx_workflow_definitions_updated_at ON workflow_definitions(updated_at);
        CREATE INDEX IF NOT EXISTS idx_workflow_definitions_status ON workflow_definitions(status);
        CREATE INDEX IF NOT EXISTS idx_workflow_runs_started_at ON workflow_runs(started_at);
        CREATE INDEX IF NOT EXISTS idx_workflow_runs_definition ON workflow_runs(workflow_definition_id, started_at);
        CREATE INDEX IF NOT EXISTS idx_workflow_step_runs_run_idx ON workflow_step_runs(workflow_run_id, step_index);
        CREATE INDEX IF NOT EXISTS idx_workflow_step_runs_run ON workflow_step_runs(run_id);
        CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_run_created ON workflow_checkpoints(run_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
    `);
}
