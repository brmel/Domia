import Database from 'better-sqlite3';
import { Kysely } from 'kysely';
import type { DatabaseSchema } from './DatabaseSchema';

export const SQLITE_MIGRATION_IDS = ['20260213_baseline_v1', '20260213_workflow_indexes_v1'] as const;

function safeAddColumn(database: Database.Database, table: string, column: string, definition: string): void {
    try {
        database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
    } catch {
        // Column already exists in upgraded databases.
    }
}

export function initializeSchema(database: Database.Database, db: Kysely<DatabaseSchema>): void {
    void db; // db reserved for future Kysely-based migrations

    database.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id TEXT PRIMARY KEY,
            applied_at DATETIME NOT NULL
        );
    `);

    applyMigrations(database);

    safeAddColumn(database, 'test_steps', 'assets_json', 'JSON');
    safeAddColumn(database, 'workflow_checkpoints', 'reason', "TEXT NOT NULL DEFAULT 'action_applied'");
    safeAddColumn(database, 'workflow_checkpoints', 'checkpoint_id', 'TEXT');
    safeAddColumn(database, 'workflow_checkpoints', 'parent_checkpoint_id', 'TEXT');
    safeAddColumn(database, 'workflow_checkpoints', 'branch_id', "TEXT NOT NULL DEFAULT 'main'");
    safeAddColumn(database, 'workflow_checkpoints', 'sequence_number', 'INTEGER NOT NULL DEFAULT 0');
    safeAddColumn(database, 'workflow_checkpoints', 'commit_boundary', 'INTEGER NOT NULL DEFAULT 0');
    safeAddColumn(database, 'workflow_checkpoints', 'side_effect_set_hash', 'TEXT');

    database.exec(`
        UPDATE workflow_checkpoints
        SET checkpoint_id = COALESCE(checkpoint_id, run_id || ':' || id)
        WHERE checkpoint_id IS NULL;
    `);

    database.exec('CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_run_created ON workflow_checkpoints(run_id, created_at);');
    database.exec('CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_run_branch_seq ON workflow_checkpoints(run_id, branch_id, sequence_number);');
}

function applyMigrations(database: Database.Database): void {
    const appliedRows = database.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: string }>;
    const applied = new Set(appliedRows.map((row) => row.id));

    const migrations: Array<{ id: string; apply: () => void }> = [
        {
            id: SQLITE_MIGRATION_IDS[0],
            apply: (): void => {
                database.exec(`
                    CREATE TABLE IF NOT EXISTS test_runs (
                        id TEXT PRIMARY KEY,
                        url TEXT NOT NULL,
                        status TEXT NOT NULL,
                        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        completed_at DATETIME,
                        duration_ms INTEGER,
                        goal TEXT,
                        summary TEXT
                    );

                    CREATE TABLE IF NOT EXISTS test_steps (
                        id TEXT PRIMARY KEY,
                        test_run_id TEXT NOT NULL,
                        step_number INTEGER NOT NULL,
                        action_type TEXT NOT NULL,
                        action_payload JSON,
                        assets_json JSON,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY(test_run_id) REFERENCES test_runs(id)
                    );

                    CREATE TABLE IF NOT EXISTS logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        test_run_id TEXT NOT NULL,
                        level TEXT NOT NULL,
                        message TEXT NOT NULL,
                        metadata JSON,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY(test_run_id) REFERENCES test_runs(id)
                    );

                    CREATE TABLE IF NOT EXISTS workflow_checkpoints (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        run_id TEXT NOT NULL,
                        checkpoint_id TEXT NOT NULL,
                        parent_checkpoint_id TEXT,
                        branch_id TEXT NOT NULL,
                        sequence_number INTEGER NOT NULL,
                        commit_boundary INTEGER NOT NULL,
                        side_effect_set_hash TEXT,
                        state_json JSON NOT NULL,
                        reason TEXT NOT NULL DEFAULT 'action_applied',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY(run_id) REFERENCES test_runs(id)
                    );

                    CREATE TABLE IF NOT EXISTS replay_idempotency_keys (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        run_id TEXT NOT NULL,
                        idempotency_key TEXT NOT NULL,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(run_id, idempotency_key),
                        FOREIGN KEY(run_id) REFERENCES test_runs(id)
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
                        test_run_id TEXT,
                        status TEXT NOT NULL,
                        summary TEXT,
                        started_at DATETIME NOT NULL,
                        completed_at DATETIME,
                        FOREIGN KEY(workflow_run_id) REFERENCES workflow_runs(id),
                        FOREIGN KEY(test_run_id) REFERENCES test_runs(id)
                    );

                    CREATE INDEX IF NOT EXISTS idx_test_runs_started_at ON test_runs(started_at);
                    CREATE INDEX IF NOT EXISTS idx_test_steps_run_step ON test_steps(test_run_id, step_number);
                    CREATE INDEX IF NOT EXISTS idx_workflow_definitions_updated_at ON workflow_definitions(updated_at);
                    CREATE INDEX IF NOT EXISTS idx_workflow_runs_started_at ON workflow_runs(started_at);
                    CREATE INDEX IF NOT EXISTS idx_workflow_step_runs_run_idx ON workflow_step_runs(workflow_run_id, step_index);
                    CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_run_created ON workflow_checkpoints(run_id, created_at);
                    CREATE INDEX IF NOT EXISTS idx_workflow_checkpoints_run_branch_seq ON workflow_checkpoints(run_id, branch_id, sequence_number);
                `);
            }
        },
        {
            id: SQLITE_MIGRATION_IDS[1],
            apply: (): void => {
                database.exec(`
                    CREATE INDEX IF NOT EXISTS idx_workflow_definitions_status ON workflow_definitions(status);
                    CREATE INDEX IF NOT EXISTS idx_workflow_runs_definition ON workflow_runs(workflow_definition_id, started_at);
                    CREATE INDEX IF NOT EXISTS idx_workflow_step_runs_test_run ON workflow_step_runs(test_run_id);
                `);
            }
        }
    ];

    const insertMigration = database.prepare(
        'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)'
    );

    const tx = database.transaction(() => {
        for (const migration of migrations) {
            if (applied.has(migration.id)) {
                continue;
            }

            migration.apply();
            insertMigration.run(migration.id, new Date().toISOString());
        }
    });

    tx();
}
