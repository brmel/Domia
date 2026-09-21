import { resultOk, resultErr, moduleId, EP } from '@domia/contracts';
import type {
  ArtifactIndexRepo, CaseRepo, DomiaModule, ExchangeRepo, MemoryRepo, ModuleHost, ModuleResult, PlanRepo,
  RunRepo, ScheduleRepo, SettingsRepo, SnapshotRepo, Store, TraceRepo,
} from '@domia/contracts';
import { Db } from './db.js';
import { attempt, STORE } from './repos/base.js';
import { SqlCaseRepo, SqlRunRepo, SqlExchangeRepo } from './repos/core.js';
import { SqlTraceRepo, SqlArtifactIndexRepo, SqlSnapshotRepo } from './repos/trace.js';
import { SqlPlanRepo, SqlMemoryRepo, SqlScheduleRepo, SqlSettingsRepo } from './repos/misc.js';
import { StoreTraceSink } from './traceSink.js';

class StoreImpl implements Store {
  readonly cases: CaseRepo;
  readonly runs: RunRepo;
  readonly plans: PlanRepo;
  readonly exchanges: ExchangeRepo;
  readonly traces: TraceRepo;
  readonly artifacts: ArtifactIndexRepo;
  readonly snapshots: SnapshotRepo;
  readonly settings: SettingsRepo;
  readonly schedules: ScheduleRepo;
  readonly memories: MemoryRepo;

  constructor(private readonly db: Db) {
    this.cases = new SqlCaseRepo(db);
    this.runs = new SqlRunRepo(db);
    this.plans = new SqlPlanRepo(db);
    this.exchanges = new SqlExchangeRepo(db);
    this.traces = new SqlTraceRepo(db);
    this.artifacts = new SqlArtifactIndexRepo(db);
    this.snapshots = new SqlSnapshotRepo(db);
    this.settings = new SqlSettingsRepo(db);
    this.schedules = new SqlScheduleRepo(db);
    this.memories = new SqlMemoryRepo(db);
  }

  migrate(): Promise<ModuleResult<void>> {
    return attempt(() => this.db.migrate());
  }

  /** node:sqlite is synchronous + single-connection, so the whole callback runs in one BEGIN/COMMIT. */
  async tx<T>(fn: (s: Store) => Promise<ModuleResult<T>>): Promise<ModuleResult<T>> {
    try {
      this.db.run('BEGIN');
      const r = await fn(this);
      this.db.run(r.isOk() ? 'COMMIT' : 'ROLLBACK');
      return r;
    } catch (e) {
      try { this.db.run('ROLLBACK'); } catch { /* already rolled back */ }
      return resultErr({ code: 'IO', module: STORE, message: e instanceof Error ? e.message : String(e), retryable: false, cause: e });
    }
  }

  close(): void {
    this.db.close();
  }
}

export interface StoreModuleOptions { readonly dbPath: string }

export function storeModule(opts: StoreModuleOptions): DomiaModule {
  let store: StoreImpl | undefined;
  return {
    manifest: { id: moduleId('store'), version: '0.0.0', provides: [EP.Store, EP.TraceSink], requires: [moduleId('trace')] },
    async init(host: ModuleHost): Promise<ModuleResult<void>> {
      store = new StoreImpl(new Db(opts.dbPath));
      const migrated = await store.migrate();
      if (migrated.isErr()) return migrated;
      const reg = host.register(EP.Store, store);
      if (reg.isErr()) return reg;
      const sink = host.register(EP.TraceSink, new StoreTraceSink(store));
      if (sink.isErr()) return sink;
      host.logger.info('store ready', { db: opts.dbPath });
      return resultOk(undefined);
    },
    async dispose(): Promise<void> {
      store?.close();
    },
  };
}
