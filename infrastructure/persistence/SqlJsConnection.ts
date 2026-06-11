import { injectable, inject } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import AsyncLock from 'async-lock';
import type { Database as SqlJsDatabase } from 'sql.js';
import { Kysely } from 'kysely';
import { SqlJsDialect } from 'kysely-wasm';
import { PersistenceError } from '@domain/errors';
import type { PathsConfigProvider } from '@shared/contracts/config';
import type { DatabaseSchema } from './DatabaseSchema';
import { initializeSchema } from './SQLiteSchema';
import { SQLiteRunRepository } from './SQLiteRunRepository';
import { SQLiteCheckpointRepository } from './SQLiteCheckpointRepository';
import { SQLiteWorkflowRepository } from './SQLiteWorkflowRepository';
import { SQLiteSkillRepository } from './SQLiteSkillRepository';
import { openDatabase, saveDatabase } from './SqlJsProvider';

/**
 * Owns the single sql.js connection lifecycle: async open + schema init, the
 * shared Kysely instance, the per-aggregate raw repositories, and the
 * ready-barrier / full-file flush semantics.
 */
@injectable()
export class SqlJsConnection {
    private db!: Kysely<DatabaseSchema>;
    private rawDb!: SqlJsDatabase;
    private runsRepo!: SQLiteRunRepository;
    private checkpointsRepo!: SQLiteCheckpointRepository;
    private workflowsRepo!: SQLiteWorkflowRepository;
    private skillsRepo!: SQLiteSkillRepository;
    private readonly dbPath: string;
    private readonly ready: Promise<void>;
    private readonly lock = new AsyncLock();
    private static readonly LANE = 'sqljs';

    constructor(@inject('PathsConfigProvider') paths: PathsConfigProvider) {
        this.dbPath = paths().databasePath;
        this.ready = this.initialize();
    }

    private async initialize(): Promise<void> {
        this.rawDb = await openDatabase(this.dbPath);
        this.rawDb.run('PRAGMA foreign_keys = ON;');
        this.db = new Kysely<DatabaseSchema>({ dialect: new SqlJsDialect({ database: this.rawDb }) });
        initializeSchema(this.rawDb);
        this.runsRepo = new SQLiteRunRepository(this.db);
        this.checkpointsRepo = new SQLiteCheckpointRepository(this.db);
        this.workflowsRepo = new SQLiteWorkflowRepository(this.db, this.rawDb);
        this.skillsRepo = new SQLiteSkillRepository(this.db);
    }

    runs(): SQLiteRunRepository { return this.runsRepo; }
    checkpoints(): SQLiteCheckpointRepository { return this.checkpointsRepo; }
    workflows(): SQLiteWorkflowRepository { return this.workflowsRepo; }
    skills(): SQLiteSkillRepository { return this.skillsRepo; }

    private persist(): void {
        saveDatabase(this.rawDb, this.dbPath);
    }

    /** Serialize every read-modify-write-flush through one lane so concurrent run lanes can't interleave against the shared in-memory DB. */
    private exclusive<T>(fn: () => Promise<T>): ResultAsync<T, PersistenceError> {
        return ResultAsync.fromPromise(
            this.lock.acquire<T>(SqlJsConnection.LANE, fn),
            (e) => (e instanceof PersistenceError ? e : new PersistenceError(`DB op failed: ${String(e)}`)),
        );
    }

    withReady<T>(op: () => ResultAsync<T, PersistenceError>): ResultAsync<T, PersistenceError> {
        return this.exclusive(async () => {
            await this.ready;
            const result = await op();
            if (result.isErr()) throw result.error;
            return result.value;
        });
    }

    withPersist<T>(op: () => ResultAsync<T, PersistenceError>): ResultAsync<T, PersistenceError> {
        return this.exclusive(async () => {
            await this.ready;
            const result = await op();
            if (result.isErr()) throw result.error;
            this.persist();
            return result.value;
        });
    }
}
