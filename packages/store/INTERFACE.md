# @domia/store — Interface Spec

**Purpose.** The only package that knows SQL. SQLite (better-sqlite3, WAL,
FK-enforced, single writer), Kysely-typed queries, one baseline schema.

**Kind.** K1 services (repos) + `Transaction` micro-context. All async (survives a
WASM / client-server swap) even where better-sqlite3 is sync.

---

## Public interface (contracts `store.ts`)

```ts
export interface Store {                                   // EP.Store (one)
  readonly cases: CaseRepo; readonly runs: RunRepo; readonly plans: PlanRepo;
  readonly exchanges: ExchangeRepo; readonly traces: TraceRepo;
  readonly artifacts: ArtifactIndexRepo; readonly snapshots: SnapshotRepo;
  readonly settings: SettingsRepo; readonly schedules: ScheduleRepo;
  readonly memories: MemoryRepo;
  migrate(): Promise<ModuleResult<void>>;
  tx<T>(fn: (s: Store) => Promise<ModuleResult<T>>): Promise<ModuleResult<T>>;
}
export interface Page<T> { readonly rows: readonly T[]; readonly total: number; readonly cursor?: string }

// representative repo — all follow this boring shape
export interface RunRepo {
  insert(row: RunRow): Promise<ModuleResult<void>>;
  update(id: RunId, patch: Partial<RunRow>): Promise<ModuleResult<void>>;
  get(id: RunId): Promise<ModuleResult<RunRow | null>>;
  list(q: RunQuery): Promise<ModuleResult<Page<RunRow>>>;
  children(parentRunId: RunId): Promise<ModuleResult<readonly RunRow[]>>;
}
export interface ExchangeRepo {                             // append-only — replay integrity
  append(row: ExchangeRow): Promise<ModuleResult<void>>;
  listByRun(runId: RunId): Promise<ModuleResult<readonly ExchangeRow[]>>;  // ordered by seq
}
```

## Internal classes

| Class | File | Responsibility |
|---|---|---|
| `StoreModule` | `module.ts` | opens db, `migrate`, registers `EP.Store` |
| `Database` | `db.ts` | better-sqlite3 handle; WAL; `PRAGMA foreign_keys=ON` |
| `WriteQueue` | `writeQueue.ts` | serializes writes onto one lane (single-writer) |
| `TxRunner` | `tx.ts` | `tx(fn)`: BEGIN → run → COMMIT; rollback on `Err`-result or throw |
| `SchemaDDL` | `schema.ts` | one baseline DDL (below); pre-1.0 = drop+recreate, no migrations |
| `*Repo` | `repos/*.ts` | CaseRepo RunRepo PlanRepo ExchangeRepo TraceRepo ArtifactIndexRepo SnapshotRepo SettingsRepo ScheduleRepo MemoryRepo — CRUD + narrow queries, Zod both directions |

## Baseline schema (`schema.ts`)

```
cases          id PK, name, target_json, assets_json, constraints_json, tool_policy_json,
               tags_json, created_at, updated_at, archived_at?
runs           id PK, case_id FK, parent_run_id FK?, persona, status, request,
               options_json, report_json?, started_at, ended_at?
plans          id PK, run_id FK UNIQUE, revision, status, updated_at
plan_items     id PK, plan_id FK, seq, title, intent, status, note?, updated_at
plan_revisions id PK, plan_id FK, revision, op_json, origin, at
exchanges      id PK, run_id FK, seq, direction(agent|tool|user), payload_json, usage_json?, at
trace_spans    span_id PK, trace_id, parent_span_id?, run_id FK?, name, attrs_json, status,
               started_at, ended_at
trace_events   id PK, span_id FK?, run_id FK?, name, attrs_json, at
artifacts      id PK, run_id FK?, kind, mime, bytes, sha256 UNIQUE, path, label?, at
snapshots      run_id PK FK, provider, blob_path, at
memories       id PK, case_id FK, title, tags_json, body_path, created_at, updated_at
schedules      id PK, case_id FK, cron, request, options_json, enabled, last_run_id FK?,
               next_at, created_at
settings       key PK, value_json, updated_at
```

Indexes: `runs(status, started_at)`, `runs(case_id)`, `exchanges(run_id, seq)`,
`plan_items(plan_id, seq)`, `trace_spans(run_id)`, `artifacts(sha256)`,
`memories(case_id)`, `schedules(enabled, next_at)`. No `workflows`, no
`stage_runs` — task structure is the agent's, recorded in plans + exchanges.

## Design notes

- Repos are deliberately dumb; joins/read-model shaping happen in `@api`.
- `traces.*` is written only by trace's `StoreSink`; nobody else touches those rows.
- `tool_policy_json` on cases carries the allow/deny lists (R6/F11), evaluated in
  tools, stored here.

## File manifest

```
store/
  package.json  tsconfig.json
  src/
    module.ts db.ts schema.ts tx.ts writeQueue.ts
    repos/cases.ts runs.ts plans.ts exchanges.ts traces.ts
          artifacts.ts snapshots.ts memories.ts schedules.ts settings.ts
    index.ts
```
