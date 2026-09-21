# @domia/api — Interface Spec

**Purpose.** The one facade UI, CLI, and `domia-mcp` consume. Validates with
contracts schemas, delegates to modules, shapes read models, streams events.
Holds live `LoopRun` handles (`RunRegistry`) so surfaces can steer running work.

**Kind.** K1 facade + `RunRegistry` (the one stateful exception).

Incorporates F1 (RunRegistry), F5 (sync-first watch), D12 (sets `interactive`),
R5 (Scheduler).

---

## Public interface (contracts `api.ts`)

```ts
export interface DomiaApi {
  readonly cases: {
    create(d: CaseDraft): Promise<ApiResult<Case>>;
    get(id: CaseId): Promise<ApiResult<Case>>;
    list(q?: CaseQuery): Promise<ApiResult<Page<Case>>>;
    update(id: CaseId, p: CasePatch): Promise<ApiResult<Case>>;
    archive(id: CaseId): Promise<ApiResult<void>>;
    validate(id: CaseId): Promise<ApiResult<CaseValidation>>;
    captureAuth(id: CaseId): Promise<ApiResult<AuthCapture>>;    // resolves SessionFactory internally (D11)
  };
  readonly runs: {
    start(caseId: CaseId, request: string, opts?: StartOptions): Promise<ApiResult<RunId>>;
    pause(id: RunId): Promise<ApiResult<void>>;
    resume(id: RunId): Promise<ApiResult<void>>;
    cancel(id: RunId, reason: string): Promise<ApiResult<void>>;
    answer(id: RunId, reply: HumanReply): Promise<ApiResult<void>>;
    get(id: RunId): Promise<ApiResult<RunView>>;
    list(q?: RunQuery): Promise<ApiResult<Page<RunSummary>>>;
    watch(id: RunId, signal?: AbortSignal): AsyncIterable<RunEvent>;   // F5: sync snapshot first, then live
  };
  readonly plans:   { get(runId: RunId): Promise<ApiResult<Plan>>;
                      history(runId: RunId): Promise<ApiResult<readonly PlanRevision[]>>;
                      watch(runId: RunId, signal?: AbortSignal): AsyncIterable<PlanRevision> };
  readonly traces:  { timeline(runId: RunId): Promise<ApiResult<readonly TimelineEntry[]>>;
                      spanTree(runId: RunId): Promise<ApiResult<SpanTree>>;
                      artifact(id: ArtifactId): Promise<ApiResult<ArtifactStreamRef>> };
  readonly tools:   { catalog(target?: TargetSpec): Promise<ApiResult<readonly ToolManifest[]>> };
  readonly agents:  { providers(): Promise<ApiResult<readonly ProviderInfo[]>>;
                      models(providerId: string): Promise<ApiResult<readonly ModelInfo[]>> };
  readonly memories:{ list(caseId: CaseId): Promise<ApiResult<readonly MemoryCard[]>>;
                      save(caseId: CaseId, m: MemoryDraft): Promise<ApiResult<MemoryCard>>;
                      remove(id: MemoryId): Promise<ApiResult<void>> };
  readonly schedules:{ create(s: ScheduleDraft): Promise<ApiResult<Schedule>>;
                      list(): Promise<ApiResult<readonly Schedule[]>>;
                      setEnabled(id: ScheduleId, on: boolean): Promise<ApiResult<void>>;
                      remove(id: ScheduleId): Promise<ApiResult<void>> };
  readonly settings:{ get(): Promise<ApiResult<Settings>>; patch(p: Partial<Settings>): Promise<ApiResult<Settings>> };
}
export interface StartOptions { questions?: 'allowed'|'never'; approvals?: 'off'|'dangerous'; persona?: PersonaId; personaOverrides?: Record<string, Partial<Persona>> }
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } };  // wire-safe
```

## Internal classes

| Class | File | Responsibility |
|---|---|---|
| `DomiaApiImpl` + `createApi(kernel, interactive?)` | `api.ts` `index.ts` | resolves domain services from the kernel; the namespaces (cases/runs/plans/traces/tools/agents/settings) are inline object fields, each delegating |
| `RunRegistry` | `runRegistry.ts` | **F1** — `Map<RunId, LoopRun>`; `start` allocs the chain (`case.allocContext` → `loop.alloc`) + inserts the row + drives in the **background** (non-blocking); evict on terminal; control after that → `RUN_NOT_LIVE`. Sets `interactive` per surface (D12) |
| `watchRun` / `watchPlan` | `watch.ts` | **F5** — emit `{type:'sync', view}` then live run events; plan revisions diffed against persisted history |
| `Scheduler` + `computeNext` | `scheduler.ts` | **R5** — enabled `schedules`, cron ticks (`@every`/`@hourly`/`@daily`) → `runs.start({interactive:false})`; `tick(now)` is pure for tests |
| `timeline` | `readModels.ts` | shape `TimelineEntry[]` from store spans + exchange tape + artifacts (no `EP.TraceQuery` needed) |
| `unwrap` | `unwrap.ts` | `ModuleResult`/`Outcome` → wire-safe `ApiResult`; strips stacks/causes/secrets |

Note: the contract `DomiaApi` (contracts `api.ts`) is the built surface —
namespaces `cases`, `runs`, `plans`, `traces`, `tools`, `agents`, `memories`,
`skills`, `settings`. `memories` wraps `EP.MemoryService` (+ `store.memories` for
remove); `skills` wraps `EP.SkillService`. Scheduling is the separate `Scheduler`
export (not a `DomiaApi` namespace). Case `validate`/`captureAuth` resolve the
`SessionFactory` from `EP.ToolService` internally (D11).

## Design notes / problems handled

- **F1.** Live control (pause/cancel/answer/takeover) needs the object, not a row.
  RunRegistry holds it; store rows are truth for dead runs.
- **D12.** `RunLauncher` sets `options.interactive`: UI/CLI-watch = true;
  Scheduler/`domia-mcp` = false → `AskHandler` degrades to suspend+notify.
- **F5.** Late subscribers (open a run view mid-run) get a full snapshot first.
- **Facade only.** No business logic — every method delegates. Transports live in
  hosts; this exports the impl + a binding helper.

## File manifest

```
api/
  package.json
  src/
    index.ts   api.ts   runRegistry.ts   watch.ts   scheduler.ts
    readModels.ts   unwrap.ts
```
