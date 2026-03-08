import type { Database as SqlJsDatabase } from 'sql.js';

export const SQLITE_MIGRATION_IDS = ['20260213_baseline_v1', '20260213_workflow_indexes_v1', '20260214_rename_legacy_tables_v1'] as const;

export function initializeSchema(database: SqlJsDatabase): void {
    database.run(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id TEXT PRIMARY KEY,
            applied_at DATETIME NOT NULL
        );
    `);

    applyMigrations(database);
}

function applyMigrations(database: SqlJsDatabase): void {
    const appliedRows = database.exec('SELECT id FROM schema_migrations');
    const applied = new Set(
        (appliedRows[0]?.values ?? []).map((row) => row[0] as string)
    );

    const migrations: Array<{ id: string; apply: () => void }> = [
        {
            id: SQLITE_MIGRATION_IDS[0],
            apply: (): void => {
                database.exec(`
                    CREATE TABLE IF NOT EXISTS runs (
                        id TEXT PRIMARY KEY,
                        url TEXT NOT NULL,
                        status TEXT NOT NULL,
                        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        completed_at DATETIME,
                        duration_ms INTEGER,
                        goal TEXT,
                        summary TEXT
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

                    CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);
                    CREATE INDEX IF NOT EXISTS idx_steps_run_step ON steps(run_id, step_number);
                    CREATE INDEX IF NOT EXISTS idx_workflow_definitions_updated_at ON workflow_definitions(updated_at);
                    CREATE INDEX IF NOT EXISTS idx_workflow_runs_started_at ON workflow_runs(started_at);
                    CREATE INDEX IF NOT EXISTS idx_workflow_step_runs_run_idx ON workflow_step_runs(workflow_run_id, step_index);
                    CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_run_created ON workflow_checkpoints(run_id, created_at);
                `);
            }
        },
        {
            id: SQLITE_MIGRATION_IDS[1],
            apply: (): void => {
                database.exec(`
                    CREATE INDEX IF NOT EXISTS idx_workflow_definitions_status ON workflow_definitions(status);
                    CREATE INDEX IF NOT EXISTS idx_workflow_runs_definition ON workflow_runs(workflow_definition_id, started_at);
                    CREATE INDEX IF NOT EXISTS idx_workflow_step_runs_run ON workflow_step_runs(run_id);
                `);
            }
        },
        {
            id: SQLITE_MIGRATION_IDS[2],
            apply: (): void => {
                const result = database.exec(
                    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='test_runs'"
                );

                if (result.length === 0) return;

                database.run(`ALTER TABLE test_runs RENAME TO runs`);
                database.run(`ALTER TABLE test_steps RENAME TO steps`);
                database.run(`ALTER TABLE steps RENAME COLUMN test_run_id TO run_id`);
                database.run(`ALTER TABLE logs RENAME COLUMN test_run_id TO run_id`);
                database.run(`ALTER TABLE workflow_step_runs RENAME COLUMN test_run_id TO run_id`);

                database.run(`DROP INDEX IF EXISTS idx_test_runs_started_at`);
                database.run(`DROP INDEX IF EXISTS idx_test_steps_run_step`);
                database.run(`DROP INDEX IF EXISTS idx_workflow_step_runs_test_run`);

                database.run(`CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at)`);
                database.run(`CREATE INDEX IF NOT EXISTS idx_steps_run_step ON steps(run_id, step_number)`);
                database.run(`CREATE INDEX IF NOT EXISTS idx_workflow_step_runs_run ON workflow_step_runs(run_id)`);
            }
        }
    ];

    database.run('BEGIN TRANSACTION');
    try {
        for (const migration of migrations) {
            if (applied.has(migration.id)) {
                continue;
            }

            migration.apply();
            database.run(
                'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
                [migration.id, new Date().toISOString()]
            );
        }
        database.run('COMMIT');
    } catch (e) {
        database.run('ROLLBACK');
        throw e;
    }
}
