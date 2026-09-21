# DOMIA V2 — Module API Reference

> Companion to [DESIGN.md](./DESIGN.md). For every module: its **functions** (with
> sync/async), its **contexts** (configuration handles — MIL `Alloc/Control/Inquire/Free`)
> versus its **results** (queryable outcome containers — MIL `AllocResult/GetResult`),
> its providers, its events, and a MIL-style usage example.
>
> Legend for the S/A column:
> **sync** plain return · **async** `Promise<…>` · **stream** `AsyncIterable<…>` ·
> **sub** callback subscription returning `Unsubscribe`

---

## Contents

1. [`@domia/contracts` — base types](#1-domiacontracts--base-types)
2. [The two doctrines: context vs result, sync vs async](#2-the-two-doctrines)
3. [`@domia/kernel`](#3-domiakernel)
4. [`@domia/trace`](#4-domiatrace)
5. [`@domia/store`](#5-domiastore)
6. [`@domia/tools`](#6-domiatools)
7. [`@domia/agent`](#7-domiaagent)
8. [`@domia/case`](#8-domiacase)
9. [`@domia/plan`](#9-domiaplan)
10. [`@domia/loop`](#10-domialoop)
11. [`@domia/api`](#11-domiaapi)
12. [`@domia/ui`](#12-domiaui)
13. [`@domia/cli`](#13-domiacli)
14. [Hosts](#14-hosts)

---

## 1. `@domia/contracts` — base types

Types only — zero logic, imports only `zod` + `neverthrow` (rule D7). This is
MIL's header set: every other package depends on it and nothing else shared.

> These are the authoritative base types (they match the per-package specs in
> [packages/](./packages/)). The type-soundness rationale — discriminated `Outcome`
> (D1), `Err` vs `failed` rule (D2), typed extension points (D3), `ProposedCall`
> vs `ToolCall` (D5) — is in [packages/DECISIONS.md](./packages/DECISIONS.md).

```ts
import type { Result } from 'neverthrow';

// ---------- identity (every handle is a branded string — the MIL_ID) ----------
type Brand<T, B extends string> = T & { readonly __brand: B };
export type ModuleId   = Brand<string, 'ModuleId'>;
export type ContextId  = Brand<string, 'ContextId'>;
export type RunId      = Brand<string, 'RunId'>;
export type CaseId     = Brand<string, 'CaseId'>;
export type PlanId     = Brand<string, 'PlanId'>;
export type ItemId     = Brand<string, 'ItemId'>;
export type PersonaId  = Brand<string, 'PersonaId'>;
export type CallId     = Brand<string, 'CallId'>;
export type ArtifactId = Brand<string, 'ArtifactId'>;
export type TraceId    = Brand<string, 'TraceId'>;
export type SpanId     = Brand<string, 'SpanId'>;
export type SecretRef  = Brand<string, 'SecretRef'>;
export type PromptRef  = Brand<string, 'PromptRef'>;   // 'roles/executor' → prompts/roles/executor.md

// ---------- errors (one catalog, one shape) ----------
export interface DomiaError {
  readonly code: ErrorCode;          // typed const map, e.g. 'TOOL_TIMEOUT', 'AGENT_AUTH'
  readonly module: ModuleId;
  readonly message: string;
  readonly retryable: boolean;
  readonly cause?: unknown;
  readonly data?: Record<string, unknown>;
}
export type ModuleResult<T> = Result<T, DomiaError>;

// ---------- module box ----------
export interface ExtensionPoint<T> { readonly id: string; readonly arity: 'one' | 'many' }  // D3 — typed token
export interface ModuleManifest {
  readonly id: ModuleId;
  readonly version: string;                       // semver
  readonly provides: readonly ExtensionPoint<unknown>[];
  readonly requires: readonly ModuleId[];         // init-order dependencies
}
export interface DomiaModule {
  readonly manifest: ModuleManifest;
  init(host: ModuleHost): Promise<ModuleResult<void>>;
  dispose(): Promise<void>;
}
export interface ModuleHost {
  readonly config: ScopedConfig;                  // sync get<T>(key, schema)
  readonly logger: Logger;
  readonly events: EventBus;
  readonly tracer: Tracer;                                          // NoopTracer until trace loads (D4)
  resolve<T>(point: ExtensionPoint<T>): ModuleResult<T>;            // sync, typed (D3)
  resolveAll<T>(point: ExtensionPoint<T>): ModuleResult<readonly T[]>;
  register<T>(point: ExtensionPoint<T>, impl: T): ModuleResult<void>;
}

// ---------- context base (MIL Alloc/Control/Inquire/Free) ----------
export interface Context<TConfig, TState = Record<string, never>> {
  readonly id: ContextId;
  configure(patch: Partial<TConfig>): ModuleResult<void>;   // sync — MControl
  inspect(): Readonly<TConfig & TState>;                    // sync — MInquire
  dispose(): Promise<void>;                                 // async — MFree, idempotent
}
export interface ContextFactory<TConfig, TCtx extends Context<TConfig, any>> {
  alloc(config: TConfig): Promise<ModuleResult<TCtx>>;      // async — MAlloc
}

// ---------- outcome base (MIL AllocResult/GetResult) ----------
export type OutcomeStatus = 'ok' | 'failed' | 'cancelled' | 'timeout' | 'suspended';
export interface TokenUsage { input: number; output: number; thinking?: number; costUsd?: number }
export interface OutcomeMeta {
  readonly startedAt: string; readonly endedAt: string; readonly durationMs: number;
  readonly traceId: TraceId;  readonly spanId: SpanId;
  readonly artifacts: readonly ArtifactRef[];
  readonly cost?: TokenUsage;
}
export type Outcome<T> =                          // D1 — discriminated, sound
  | { readonly status: 'ok'; readonly value: T; readonly meta: OutcomeMeta; toJSON(): unknown }
  | { readonly status: Exclude<OutcomeStatus,'ok'>; readonly error: DomiaError; readonly meta: OutcomeMeta; toJSON(): unknown };

// ---------- buffers (MIL MbufAlloc) ----------
export interface ArtifactRef {
  readonly id: ArtifactId;
  readonly kind: 'screenshot' | 'video' | 'snapshot' | 'file' | 'report' | 'recording';
  readonly mime: string; readonly bytes: number; readonly sha256: string;
  readonly label?: string;
}

// ---------- cancellation ----------
export type CancelSignal = AbortSignal;   // cooperative; checked between turns/calls

// ---------- the typed event map (kernel bus) ----------
export interface DomiaEventMap {
  'module.loaded':      { module: ModuleId; version: string };
  'run.started':        { runId: RunId; caseId: CaseId; request: string; parentRunId?: RunId };
  'run.spawned':        { runId: RunId; childRunId: RunId; persona: PersonaId };
  'run.turn':           { runId: RunId; turn: AgentTurnSummary };
  'run.call':           { runId: RunId; call: ToolCallSummary; status: OutcomeStatus };
  'run.plan.changed':   { runId: RunId; revision: number; diff: PlanDiff };
  'run.waiting_user':   { runId: RunId; question: string; kind: 'ask' | 'approval' };
  'run.signal':         { runId: RunId; signal: Signal };            // informants
  'run.terminal':       { runId: RunId; status: OutcomeStatus; report: RunReport };
  'artifact.saved':     { runId?: RunId; ref: ArtifactRef };
}
```

Also in contracts (referenced throughout, defined once): `TargetSpec`,
`ToolManifest`, `ToolCall`, `ToolOutput`, `Observation`, `AgentConfig`,
`AgentTurn`, `ProposedCall`/`ToolCall` (D5), `StepInput`, `Plan`, `PlanItem`, `PlanOp`,
`PlanDiff`, `RunOptions`, `Persona`, `RunReport`, `Signal`, `HumanReply`, the `DomiaApi`
interface, and Zod schemas for all of them under `schemas/`.

**Kind.** Types only — exempt from the lifecycle.

**In the journeys.** Everywhere and nowhere: every payload crossing a boundary in
J0–J9 is one of these types; schemas validate at api edges (run starts, answers)
and at store rows.

**Implementation.**
- Zero runtime code except Zod schemas + typed-const maps.
- One file per module interface so a consumer imports exactly its slice.
- Breaking a type = major version bump; conformance kits pin the version.

**Files.**
```
packages/contracts/src/
  ids.ts errors.ts module.ts context.ts outcome.ts artifact.ts
  events.ts signal.ts secret.ts prompt.ts
  tools.ts agent.ts case.ts plan.ts loop.ts trace.ts store.ts api.ts
  schemas/                  one *.schema.ts per wire type
  index.ts                  explicit re-exports (no `export *`)
```

---

## 2. The two doctrines

### 2.1 Context vs Result

| | **Context** (MIL context handle) | **Result** (`Outcome<T>`, MIL result buffer) |
|---|---|---|
| What it is | Configuration + live state, allocated before use | Immutable record of one execution |
| Created by | `alloc(config)` — async | Returned by every execute — never pre-allocated |
| Mutability | Mutable via `configure(patch)` (sync, validated) | Frozen; `toJSON()` is lossless |
| Readable via | `inspect()` (sync snapshot of config+state) | Direct typed fields (`outcome.value.…`, `outcome.meta.…`) |
| Reuse | Alloc once, execute **many** times | One per execution; persisted to trace/store |
| Holds live handles? | Yes (browser, conversation, plan, run) | **Never** — only data + `ArtifactRef`s |
| Serializable? | No — use `snapshot()` where persistence is needed | Always |
| Lifetime ends | `dispose()` (async, idempotent, deterministic) | Garbage-collected; the persisted copy lives on |
| Flow direction | **Down** — caller allocates and passes into callees | **Up** — callee returns to caller, caller persists/reacts |

Contexts in the system: `Kernel` (process), `TargetSession`, `AgentContext`,
`CaseContext`, `PlanContext`, `LoopRun`,
`Span` (micro-context), `Transaction` (micro-context).

Results in the system: `Outcome<ToolOutput>`, `Outcome<Observation>`,
`Outcome<AgentTurn>`, `Outcome<CaseValidation>`, `PlanRevision`,
`Outcome<RunReport>`, `SpanTree`, `Page<Row>`.

### 2.2 Sync vs Async

One doctrine, applied mechanically — never per-function taste:

| Rule | Applies to | Form |
|---|---|---|
| **S1** In-memory reads/writes are **sync** | `configure`, `inspect`, `manifests`, `current()`, registry `resolve/register`, `events.emit/on`, span ops | plain value or `ModuleResult<T>` |
| **S2** Anything touching I/O is **async** | `alloc`, `dispose`, `invoke`, `observe`, `step`, repos, `saveArtifact`, `validate`, `apply` (persists) | `Promise<ModuleResult<T>>` or `Promise<ModuleResult<Outcome<T>>>` |
| **S3** Long-running work = async start, **stream** progress, cooperative cancel | `run.start()` + `run.events()`, `agent.stream()`, `api.runs.watch()` | promise resolves at terminal state; `AsyncIterable` for progress; `CancelSignal` checked between units of work (turns, calls) — never mid-write |
| **S4** Subscriptions are **sub** | `events.on`, `plan.onChange` | sync registration returning `Unsubscribe`; callbacks must not block (sinks buffer) |
| **S5** `dispose()` is always async + idempotent | every context | double-dispose is a no-op; kernel force-disposes leaked contexts at shutdown (and logs the leak) |
| **S6** No fire-and-forget | everywhere | every started operation is awaited by someone or tracked by the kernel |

MIL translation: MIL's synchronous `Control/Inquire` stay sync here; MIL's
asynchronous grab + hook functions become S3 streams + S4 subscriptions.

### 2.3 Module kinds — how strictly the lifecycle applies

The triad is enforced where live state exists, never forced where it doesn't
(analysis: [DESIGN.md §3.2](./DESIGN.md)):

| Kind | Shape | Modules | Lifecycle |
|---|---|---|---|
| **K1 service** | stateless async functions | store repos, trace tracer/query, case CRUD, api | no contexts — `DomiaModule` base only |
| **K2 factory** | `alloc → Context → execute → Outcome → dispose` | tools, agent, case (context side), plan, loop | full MIL triad, kernel-tracked |
| **K3 provider** | impl registered at an extension point, consumed by a K1/K2 module | tool/agent providers, meta-tool handlers, sinks | follows its owner's lifecycle |
| micro-context | alloc/free pair without configure | `Span`, `Transaction` | pair discipline only |

Every module section below states: **Kind**, the API tables, **In the journeys**
(J0–J9 from [DESIGN.md §8](./DESIGN.md)), **Implementation** notes, and **Files**.

---

## 3. `@domia/kernel`

**Purpose.** The `MappAlloc`: one per process. Module loading, extension-point
registry, event bus, scoped config/logging, lifecycle.

**Contexts:** the `Kernel` itself (process-lifetime context).
**Results:** none — load/shutdown return `void` via `ModuleResult` (errors carry the detail).

| Function | S/A | Signature | Notes |
|---|---|---|---|
| `createKernel` | sync | `(config: KernelConfig) → Kernel` | pure construction; nothing started |
| `kernel.load` | async | `(modules: readonly DomiaModule[]) → Promise<ModuleResult<void>>` | topo-sort by `manifest.requires`; fails fast on cycles/missing; calls each `module.init(host)` |
| `kernel.resolve` | sync | `<T>(point: ExtensionPoint<T>) → ModuleResult<T>` | `'one'`-arity points error on 0 or 2+ registrations (D3) |
| `kernel.resolveAll` | sync | `<T>(point) → ModuleResult<readonly T[]>` | multi points (providers, sinks, meta-tools) |
| `kernel.events.emit` | sync | `<K>(type: K, payload: DomiaEventMap[K]) → void` | non-blocking; subscribers must not throw |
| `kernel.events.on` | sub | `<K>(type, fn) → Unsubscribe` | |
| `kernel.events.stream` | stream | `<K>(type, signal?) → AsyncIterable<DomiaEventMap[K]>` | back-pressure-safe (bounded buffer, drop-oldest + counter) |
| `kernel.shutdown` | async | `() → Promise<void>` | reverse-order module dispose; force-disposes leaked contexts (S5) |

**Kernel middleware (rule R3).** Any factory registered through
`host.register(point, factory)` is wrapped: `alloc`/`dispose` get spans + logs +
live-context tracking automatically. Modules never write that plumbing.

**Events emitted:** `module.loaded`.

```ts
// MIL: MappAlloc … MappFree
const kernel = createKernel(cfg);                       // sync construct
(await kernel.load([traceModule(), storeModule(), …]))  // async init chain
  ._unsafeUnwrap();
// … lifetime of the process …
await kernel.shutdown();                                // reverse-order free
```

**Kind.** The root context — `createKernel → load → shutdown` is the
process-level alloc/execute/dispose.

**In the journeys.** J0 boots it minimal for doctor checks; every other journey
runs inside `bootHeadless`/`bootDesktop`. Its event bus carries every live-feed
arrow in J3/J4.

**Implementation.**
- ~500 lines total. No DI library: a `Map<string, unknown[]>` keyed by `point.id` + topo-sort.
- `middleware.ts` wraps registered factories: span per alloc/dispose + live-context
  tracking (leak report at shutdown).
- Bus over `mitt`; `stream()` uses bounded async queues (drop-oldest + drop counter).

**Files.**
```
packages/kernel/src/
  kernel.ts registry.ts topo.ts eventBus.ts
  config.ts logger.ts middleware.ts contextTracker.ts
  index.ts
```

---

## 4. `@domia/trace`

**Purpose.** What happened: span trees, events, artifacts (the `MbufAlloc`),
cost accounting, pluggable sinks, and the replay read-side.

**Contexts:** `Span` (micro-context: alloc = `span()`, free = `end()`).
**Results:** `TraceRecord` (sink unit), `SpanTree`, `AgentExchange[]`,
`TimelineEntry[]`, `ArtifactRef`.

| Function | S/A | Signature | Notes |
|---|---|---|---|
| `tracer.span` | sync | `(name, attrs?) → Span` | buffered write; cheap enough for every boundary |
| `span.child` | sync | `(name, attrs?) → Span` | tree structure |
| `span.setAttrs` | sync | `(attrs) → void` | merge |
| `span.addCost` | sync | `(usage: TokenUsage) → void` | rolls up to parent + run total |
| `span.end` | sync | `(status: OutcomeStatus, error?: DomiaError) → void` | idempotent |
| `tracer.event` | sync | `(name, attrs?) → void` | point-in-time fact |
| `tracer.saveArtifact` | async | `(data: Uint8Array \| ReadableStream, meta: ArtifactMeta) → Promise<ModuleResult<ArtifactRef>>` | content-addressed on disk (`artifacts/sha256/ab/cd…`); dedupes by hash |
| `tracer.openArtifact` | async | `(id: ArtifactId) → Promise<ModuleResult<ReadableStream>>` | |
| `tracer.flush` | async | `() → Promise<void>` | D16 — awaits buffered records to sinks; called at run terminal. Sink `flush` awaits its in-flight drain, never early-returns (D13) |
| `sink.write` | sync | `(record: TraceRecord) → void` | must be non-blocking; buffer internally |
| `sink.flush` | async | `() → Promise<void>` | called at run end + shutdown |
| `query.runTree` | async | `(runId) → Promise<ModuleResult<SpanTree>>` | reads via `@store` rows |
| `query.agentExchanges` | async | `(runId) → Promise<ModuleResult<readonly AgentExchange[]>>` | **the replay source** — ordered turns incl. clarify Q&A |
| `query.timeline` | async | `(runId) → Promise<ModuleResult<readonly TimelineEntry[]>>` | UI-shaped flattening |

**Extension point** `trace.sink` (multi): built-ins `JsonlSink` (per-run
`trace.jsonl`), `StoreSink` (rows), `OtlpSink` (env-gated).

**Traced non-negotiables:** module init; every context alloc/dispose; every agent
exchange (full request/response, secrets redacted, usage); every tool call (args,
outcome, before/after screenshot refs); every plan revision; every spawn;
every informant signal.

```ts
// MIL: result buffer usage
const s = tracer.span('tool.invoke', { tool: call.name });   // alloc
s.setAttrs({ ref: args.ref });                                // control
// … work …
s.addCost(usage); s.end('ok');                                // fill + free
```

**Kind.** K1 services (`Tracer`, `TraceQuery`) + `Span` micro-context + K3 sinks.

**In the journeys.** Silent in all of them; feeds J6 entirely (timeline,
filmstrip, cost rollup) and powers replay (J6/J9). F4: artifacts reach the UI by
ref + protocol stream, never as bytes over IPC.

**Implementation.**
- `Tracer` writes `TraceRecord`s to an in-process ring buffer; sinks drain
  asynchronously (S4 — never block the hot path).
- Artifact store: `artifacts/<sha256[0:2]>/<sha256>` on disk; dedupe by hash
  before write; `redact.ts` strips secrets before any record leaves the process.
- Build order: jsonl sink slice 0, store sink slice 4, otlp last (env-gated).

**Files.**
```
packages/trace/src/
  module.ts tracer.ts span.ts ring.ts
  artifacts.ts query.ts redact.ts
  sinks/jsonl.ts sinks/store.ts sinks/otlp.ts
  index.ts
```

---

## 5. `@domia/store`

**Purpose.** The only package that knows SQL. SQLite (better-sqlite3, WAL,
FK-enforced, single writer), Kysely-typed queries, one baseline schema.

**Contexts:** `Transaction` (micro-context — the `tx` callback scope).
**Results:** typed rows (`RunRow`, `PlanRow`, …), `Page<T>`.

Everything here is **async** (S2) even where better-sqlite3 is synchronous
underneath — the interface must survive a WASM or client-server swap.

| Function | S/A | Signature | Notes |
|---|---|---|---|
| `store.migrate` | async | `() → Promise<ModuleResult<void>>` | idempotent; pre-1.0 = recreate |
| `store.tx` | async | `<T>(fn: (s: Store) → Promise<ModuleResult<T>>) → Promise<ModuleResult<T>>` | rollback on `err` result or throw |
| `cases.*` | async | `insert / update / get / list(q) / archive` | |
| `runs.*` | async | `insert / update / get / list(q: RunQuery) / children(parentRunId)` | |
| `plans.*` | async | `upsert / get(runId) / items(planId) / appendRevision / history(planId)` | |
| `exchanges.*` | async | `append / listByRun(runId)` — append-only | replay integrity |
| `traces.*` | async | `insertSpan / endSpan / insertEvent / spansByRun` | written by `StoreSink` only |
| `artifacts.*` | async | `index / bySha(sha256) / byRun(runId)` | refs only; blobs on disk |
| `snapshots.*` | async | `save / load(runId)` | suspend/resume |
| `settings.*` | async | `get / patch` | |

Repo rule: repos are **boring** — CRUD + narrow queries, Zod-validated rows at the
edge. No joins-as-API; read-model shaping happens in `@api` queries.

**Kind.** K1 services (repos) + `Transaction` micro-context.

**In the journeys.** Every write in J1–J5 lands here; J6 reads only; J0 checks
writability. The append-only `exchanges` table is what makes J6/J9 replay
trustworthy.

**Implementation.**
- better-sqlite3 behind the async facade (S2 keeps the WASM / client-server swap
  open); WAL; single writer via an internal queue.
- `schema.ts` = one baseline DDL (pre-1.0: delete db to recreate); Kysely table
  types derive from it.
- Repos take/return contracts row types; Zod-validate on read too — catch drift early.

**Files.**
```
packages/store/src/
  module.ts db.ts schema.ts tx.ts writeQueue.ts
  repos/cases.ts runs.ts plans.ts exchanges.ts
        traces.ts artifacts.ts snapshots.ts settings.ts
  index.ts
```

---

## 6. `@domia/tools`

**Purpose.** Everything the agent can *do*. Providers attach to a **TargetSession**
(the `MsysAlloc`) which exposes exactly two execution verbs: `invoke` and `observe`.

**Contexts:** `TargetSession` (per live target), `ToolBinding` (per provider
attachment, internal).
**Results:** `Outcome<ToolOutput>`, `Outcome<Observation>`.

### Service (extension point `tools.service`, singleton)

| Function | S/A | Signature | Notes |
|---|---|---|---|
| `providers` | sync | `() → readonly ToolProviderInfo[]` | registered `tools.provider`s |
| `catalog` | sync | `(target: TargetSpec) → readonly ToolManifest[]` | what *would* be offered — for UI/CLI listing |
| `allocSession` | async | `(target: TargetSpec, opts?: SessionOptions) → Promise<ModuleResult<TargetSession>>` | launches/attaches target, attaches every supporting provider, capability-gates the manifest set. Attach-targets take an exclusive lock → `TARGET_BUSY` (F3); `opts` has `headed`/`interactive` (F2). Runs in-process. (The `invoke`/`observe` seam is deliberately the only coupling to the loop, so a future remote session is a host-only addition — DESIGN §17; not built now.) |

### Provider (extension point `tools.provider`, multi)

| Function | S/A | Signature | Notes |
|---|---|---|---|
| `provider.supports` | sync | `(target: TargetSpec) → boolean` | e.g. playwright: web+electron |
| `provider.manifests` | sync | `(target) → readonly ToolManifest[]` | static metadata, written for the LLM |
| `provider.attach` | async | `(target, session: TargetSession) → Promise<ModuleResult<ToolBinding>>` | launch browser / connect CDP / init nut-js … |
| `binding.execute` | async | `(call: ToolCall, io: BindingIO) → Promise<ModuleResult<ToolOutput>>` | raw execution; middleware lives above |
| `binding.dispose` | async | `() → Promise<void>` | |

### TargetSession

| Function | S/A | Signature | Notes |
|---|---|---|---|
| `configure` / `inspect` | sync | `Context<SessionConfig, SessionState>` | viewport, default timeouts, recording on/off; state: url, title, capabilities, openTabs |
| `manifests` | sync | `() → readonly ToolManifest[]` | post-gating toolset the agent is offered |
| `invoke` | async | `(call: ToolCall, signal?: CancelSignal) → Promise<ModuleResult<Outcome<ToolOutput>>>` | **the one execution path**, middleware: `validate(zod) → span → informants → binding.execute → capture(after) → record` |
| `observe` | async | `(opts?: ObserveOptions) → Promise<ModuleResult<Outcome<Observation>>>` | ARIA/native snapshot + optional screenshot artifact + `changedSinceLast` |
| `dispose` | async | `() → Promise<void>` | closes target deterministically |

### Key value shapes

```ts
export interface ToolManifest {
  readonly name: ToolName;                       // 'browser.click'
  readonly description: string;                  // LLM-facing
  readonly parameters: z.ZodObject<z.ZodRawShape>;
  readonly output: z.ZodTypeAny;
  readonly capabilities: readonly Capability[];  // 'dom' | 'native-input' | 'shell' | 'vision' | 'fs'
  readonly risk: 'safe' | 'guarded' | 'dangerous';   // informs policy signals — never a veto
  readonly longRunning?: boolean;
}
export interface ToolCall  { callId: CallId; name: ToolName; args: Record<string, unknown>; timeoutMs?: number }
export interface ToolOutput{ value: unknown; observationHint?: 'changed' | 'unchanged' }
export interface Observation {
  snapshot: AriaSnapshot | NativeSnapshot;       // numbered refs (ref=e12) the agent acts on
  url?: string; title?: string;
  screenshot?: ArtifactRef;
  changedSinceLast: boolean;
}
```

### Built-in providers and their tools

| Provider | Targets | Tools | Notes |
|---|---|---|---|
| `mcp` (`McpToolProvider`) | web, electron, any | tools of the mounted server, mapped to manifests | **default browser = microsoft/playwright-mcp** (`browser.* observe` with `ref=eN` ARIA snapshots, `--storage-state`, `--cdp-endpoint`); plus any case-mounted server (github, postgres…). ECOSYSTEM E1/E2 |
| `capture` | all | `screen.screenshot`, `screen.record.start/stop` | video → artifact; also consumes playwright-mcp trace/video |
| `os-a11y` (R1) | desktop | `os.observe · os.click · os.type` | macOS AX API first — structured before pixels |
| `vision` (R1) | all | `vision.locate {description} → ref/coords` | grounding ladder rung 2; hostile/DOM-less UIs |
| `native-input` | desktop (+fallback) | `input.move · click · drag · type · hotkey` | coordinates — last rung |
| `shell` | shell, all | `shell.exec {cmd, cwd?, timeoutMs?}` | risk `dangerous`, output capped, cwd sandbox-rooted |
| `files` | all | `fs.read · write · list` | rooted at `caseCtx.workdir` (tighter than the generic filesystem MCP server) |

**Events emitted:** `run.call` (via loop), `artifact.saved`.

```ts
// MIL: MsysAlloc + MdigAlloc + execute
const session = (await tools.allocSession({ kind:'web', url }))._unsafeUnwrap(); // Alloc
session.configure({ defaultTimeoutMs: 8000 });                                    // Control
const obs = await session.observe();                                              // Execute → Result
const out = await session.invoke({ callId, name:'browser.click', args:{ ref:'e12' } });
console.log(out.value.meta.durationMs, out.value.meta.artifacts);                 // GetResult
await session.dispose();                                                          // Free
```

**Kind.** K2 factory (`TargetSession` — the canonical context) + K3 providers.

**In the journeys.** J1 auth capture (headed interactive session); J2/J3 execute
loops (`invoke`/`observe`); J5 fresh session on resume; J8 plugins add providers.
F3 target lock lives in `allocSession`.

**Implementation.**
- `session.ts` owns the middleware chain (`validate → span → informants → execute
  → capture → record`) — providers implement raw `binding.execute` only.
- `locks.ts`: attach-targets exclusive, isolated targets unlimited (F3).
- `McpToolProvider`: JSON-Schema→Zod manifest mapping; one server per
  `TargetSession`; playwright-mcp gives ARIA `ref=eN` snapshots directly, so no
  ref-map code of our own. `launcher.ts` spawns Electron with
  `--remote-debugging-port`, playwright-mcp attaches via `--cdp-endpoint`.
- Build order: `mcp`+playwright-mcp + capture (slice 1); shell/files + skills
  (slice 7); os-a11y/vision/native-input (slice 8). MCP servers are
  kernel-tracked contexts with a restart policy (F8); one crashed mount → failed
  `Outcome`s, never a failed run.

**Files.**
```
packages/tools/src/
  module.ts service.ts session.ts middleware.ts locks.ts manifest.ts
  providers/mcp/{provider.ts, serverManager.ts, launcher.ts, schemaMap.ts}  # E1/E2; launcher spawns electron+CDP
  providers/capture/{provider.ts, video.ts}
  providers/os-a11y/provider.ts   providers/vision/provider.ts   # R1
  providers/shell/{provider.ts, policy.ts}
  providers/files/provider.ts   providers/native-input/provider.ts
  providers/skills/{library.ts, recorder.ts, player.ts}          # E4 SKILL.md
  index.ts
```

---

## 7. `@domia/agent`

**Purpose.** The brain socket. One propose-only conversation interface over any
LLM library. **Never executes a tool** — it emits intents.

**Contexts:** `AgentContext` (conversation + model + toolset handle; alloc once
per persona instance, `step` many times).
**Results:** `Outcome<AgentTurn>` (usage in `meta.cost`), `ConversationSnapshot`.

### Service (extension point `agent.service`, singleton)

| Function | S/A | Signature | Notes |
|---|---|---|---|
| `providers` | sync | `() → readonly ProviderInfo[]` | |
| `models` | async | `(providerId: string) → Promise<ModuleResult<readonly ModelInfo[]>>` | may hit the provider API |
| `alloc` | async | `(config: AgentConfig) → Promise<ModuleResult<AgentContext>>` | routes to `config.provider` |

### AgentContext

| Function | S/A | Signature | Notes |
|---|---|---|---|
| `configure` / `inspect` | sync | `Context<AgentConfig, AgentState>` | tunables: temperature, thinking budget, toolset swap between steps; state: turnCount, cumulative usage |
| `step` | async | `(input: StepInput, signal?: CancelSignal) → Promise<ModuleResult<Outcome<AgentTurn>>>` | **the one exchange** — full request/response traced |
| `stream` | stream | `() → AsyncIterable<AgentStreamEvent>` | live tokens/thoughts for surfaces; optional per provider |
| `fork` | async | `() → Promise<ModuleResult<AgentContext>>` | branch conversation (sub-runs, what-ifs) |
| `snapshot` | async | `() → Promise<ModuleResult<ConversationSnapshot>>` | suspend/resume (V1 keeper) |
| `restore` | async | `(s: ConversationSnapshot) → Promise<ModuleResult<void>>` | |
| `dispose` | async | `() → Promise<void>` | |

### The propose-only exchange

```ts
export interface AgentConfig {
  readonly provider: string;                 // 'gemini' | 'claude' | 'openai-compat' | 'ollama' | 'replay'
  readonly model: string;
  readonly systemPrompt: PromptRef;          // prompts/*.md — never inline
  readonly tools: readonly ToolManifest[];   // target tools + meta-tool belt (persona decides)
  readonly temperature?: number;
  readonly thinking?: ThinkingConfig;
  readonly auth: AuthRef;                    // key ref / ADC / none (local)
}

export type StepInput =
  | { kind: 'goal';        goal: string; observation?: Observation }
  | { kind: 'toolResults'; results: readonly Outcome<ToolOutput>[]; observation?: Observation }
  | { kind: 'user';        message: string }                 // user.ask answers, approval replies
  | { kind: 'informant';   signals: readonly Signal[] };     // budget/health — information, not command

export type AgentTurn =
  | { kind: 'act';   calls: readonly ToolCall[]; thought?: string }
  | { kind: 'ask';   question: string }                      // wants human input
  | { kind: 'final'; summary: string; verdict?: 'pass' | 'fail'; value?: unknown };
```

Contract points (conformance-kit enforced):

- `final.verdict` is **optional** — verdict-less finish is legitimate (V1 lesson).
- Terminal is a **turn kind, not a tool** — adapters for SDKs with finish-tools map
  them to `final`.
- SDKs that insist on executing tools (ADK-style) are wrapped: their tool stubs
  suspend and yield the call list back as an `act` turn; results resume the SDK.
  The loop never knows.
- Budget ceilings arrive as `informant` inputs; the provider never self-terminates
  on them (no hidden vetoes).

**Providers:** ONE **`AiSdkProvider`** (Vercel AI SDK — 25+ model providers:
OpenAI, Anthropic, Google/Gemini incl. ADC, Bedrock, Azure, Mistral, xAI, Ollama,
any OpenAI-compatible endpoint; ECOSYSTEM E3) + `ReplayProvider` (serves
`trace.agentExchanges(runId)` — the test double that is real data). Tools are
declared to the SDK **without execute functions**, so it returns tool calls
instead of running them — exactly our propose-only contract. We do NOT use the
SDK's agent loop; the loop is the product.

```ts
// MIL: alloc once, execute many
const agent = (await agents.alloc(personaConfig('lead', manifests)))._unsafeUnwrap();
let turn = await agent.step({ kind:'goal', goal, observation });        // Execute → Result
while (turn.value.value.kind === 'act') { /* the loop routes calls */ }
await agent.dispose();                                                   // Free
```

**Kind.** K2 factory (`AgentContext`) + K3 providers.

**In the journeys.** The lead persona allocs one per run; every `agent.spawn`
allocs another (persona decides model + toolset); J5 snapshot/restore; J7 provider/model switch is pure config; J6/J9
the replay provider serves recorded exchanges.

**Implementation.**
- `AiSdkProvider`: thin — each `step()` = one `generateText`/`streamText` with
  tools-sans-execute; the SDK owns provider quirks (schemas, streaming, per-vendor
  retry, tool caching). All the undifferentiated adapter code V1 drowned in is gone.
- `ModelRegistry` + `FailoverChain` (R7): ordered model list per persona; switch
  on auth/quota/5xx/malformed-tool errors only — never on task difficulty.
- `ReplayProvider` ≈ 100 lines over `trace.agentExchanges` — build in slice 2,
  pays for itself forever.
- `SdkLoopBridge` kept for any SDK that insists on executing tools: stubs park on
  a deferred, surface an `act` turn, resume on results.

**Files.**
```
packages/agent/src/
  module.ts service.ts context.ts conversation.ts snapshot.ts
  modelRegistry.ts failover.ts
  providers/aisdk/{provider.ts, map.ts, bridge.ts}   # 25+ model providers via Vercel AI SDK
  providers/replay/provider.ts
  index.ts
```

---

## 8. `@domia/case`

**Purpose.** The durable definition of a target: how to reach it, authenticate,
what data it needs, which constraints inform the run.

**Contexts:** `CaseContext` (secrets resolved, workdir materialized).
**Results:** `Outcome<CaseValidation>`, `Case` rows.

### Service (extension point `case.service`, singleton)

| Function | S/A | Signature | Notes |
|---|---|---|---|
| `create` | async | `(draft: CaseDraft) → Promise<ModuleResult<Case>>` | Zod-validated |
| `get` / `list` / `update` / `archive` | async | CRUD via `@store` | |
| `validate` | async | `(id: CaseId) → Promise<ModuleResult<Outcome<CaseValidation>>>` | target reachable? auth present? secrets resolvable? — advisory report |
| `captureAuth` | async | `(id: CaseId) → Promise<ModuleResult<Outcome<AuthCapture>>>` | F2 — headed interactive session, user logs in by hand, storageState exported + encrypted into `assets.authState` |
| `allocContext` | async | `(id: CaseId) → Promise<ModuleResult<CaseContext>>` | resolves secrets, materializes files, creates sandbox workdir |

### CaseContext

| Function | S/A | Signature | Notes |
|---|---|---|---|
| `configure` / `inspect` | sync | overrides for this allocation (viewport, env additions) | |
| `resolvedTarget` | sync (field) | `TargetSpec` | placeholders/secrets substituted |
| `workdir` | sync (field) | `string` | sandbox root for `files` provider |
| `secret` | sync | `(ref: SecretRef) → ModuleResult<string>` | resolved at alloc; **never traced, never logged** |
| `dispose` | async | `() → Promise<void>` | cleans workdir per policy |

### Shapes

```ts
export interface Case {
  readonly id: CaseId; readonly name: string;
  readonly target: TargetSpec;
  readonly requestTemplate?: string;             // optional default request with {placeholders}
  readonly assets: CaseAssets;                   // authState, env, files, seeds, mcpServers (E1)
  readonly constraints: readonly Constraint[];   // informants: allowed hosts, data rules, spend hints
  readonly tags: readonly string[];
}
export type TargetSpec =
  | { kind: 'web';      url: string; viewport?: Viewport }
  | { kind: 'electron'; appPath: string; args?: string[]; attach?: { cdpPort: number } }
  | { kind: 'desktop';  app?: string }
  | { kind: 'shell';    cwd: string };
  // deferred (§17, not built): { kind:'container'; image; daemon } for a disposable VM desktop
```

**Kind.** Hybrid: K1 service (CRUD, validate, captureAuth) + K2 factory (`CaseContext`).

**In the journeys.** J1 owns it end-to-end (create → captureAuth → validate);
every run journey opens with `allocContext` (J2/J3/J5).

**Implementation.**
- Secrets: OS keychain where available, else age-encrypted file;
  `CaseContext.secret()` resolves from memory — rows and traces hold refs only.
- `authCapture.ts` drives a headed `TargetSession`, waits for the user's
  "I'm logged in" confirmation, exports storageState (F2).
- Workdir: `~/.domia/work/<runId>/`, cleaned on dispose per retention policy.

**Files.**
```
packages/case/src/
  module.ts service.ts context.ts
  secrets.ts authCapture.ts validate.ts workdir.ts
  index.ts
```

---

## 9. `@domia/plan`

**Purpose.** The living plan — **data + tools, never an engine**. The agent creates
and revises plan items through `plan.*` tools; the UI/CLI render it live; nothing
in the system blocks on it (informants, not vetoes).

**Contexts:** `PlanContext` (one per run — the mutable plan handle).
**Results:** `Plan` (versioned snapshot), `PlanRevision`, `PlanDiff`.

### Service (extension point `plan.service`, singleton)

| Function | S/A | Signature | Notes |
|---|---|---|---|
| `allocContext` | async | `(runId: RunId, goal: string) → Promise<ModuleResult<PlanContext>>` | creates empty plan, revision 0, persisted |
| `query.get` | async | `(runId) → Promise<ModuleResult<Plan \| null>>` | read model |
| `query.history` | async | `(runId) → Promise<ModuleResult<readonly PlanRevision[]>>` | full audit of ops |

### PlanContext

| Function | S/A | Signature | Notes |
|---|---|---|---|
| `current` | sync | `() → Plan` | in-memory snapshot (S1) |
| `apply` | async | `(op: PlanOp, origin: 'agent' \| 'user') → Promise<ModuleResult<PlanRevision>>` | validates transition, bumps revision, write-through persist, traces, emits `run.plan.changed` |
| `toolManifests` | sync | `() → readonly ToolManifest[]` | the `plan.*` manifests, injected into agent toolsets by role config |
| `dispatch` | async | `(call: ToolCall) → Promise<ModuleResult<Outcome<ToolOutput>>>` | ToolRouter target: maps a `plan.*` call to `apply` |
| `onChange` | sub | `(fn: (rev: PlanRevision) → void) → Unsubscribe` | UI live board |
| `staleness` | sync | `() → Signal \| null` | informant: active item untouched for N turns → signal, never a stop |
| `dispose` | async | `() → Promise<void>` | plan data persists; context releases |

### The `plan.*` toolset (what the agent sees)

| Tool | Args | Effect |
|---|---|---|
| `plan.propose` | `{ items: {title, intent}[] }` | initial plan or full re-plan (keeps done items, replaces pending) |
| `plan.add_item` | `{ title, intent, afterSeq? }` | insert |
| `plan.start_item` | `{ itemId }` | mark active (one active at a time — soft rule, signaled not enforced) |
| `plan.complete_item` | `{ itemId, note? }` | mark done with evidence note |
| `plan.drop_item` | `{ itemId, reason }` | abandon with reason |
| `plan.revise` | `{ ops: PlanOp[] }` | atomic batch |
| `plan.note` | `{ text }` | free-form annotation on the plan |

### Shapes

```ts
export interface Plan {
  readonly id: PlanId; readonly runId: RunId;
  readonly goal: string;
  readonly items: readonly PlanItem[];
  readonly revision: number;
  readonly status: 'empty' | 'active' | 'settled';
}
export interface PlanItem {
  readonly id: ItemId; readonly seq: number;
  readonly title: string;                       // short, user-facing
  readonly intent: string;                      // what "done" means for this item
  readonly status: 'pending' | 'active' | 'done' | 'dropped';
  readonly note?: string;
}
```

**Kind.** K2 factory (`PlanContext`).

**In the journeys.** J3 plan board + audit history; J2 optional (agent's choice);
J5 the plan survives suspend untouched — it is rows, not memory.

**Implementation.**
- Pure state machine in `ops.ts` (op → validated transition → new revision) —
  fully testable through the public API, no browser needed.
- Write-through: `apply` persists the revision and emits `run.plan.changed`
  **before** returning — the UI board is never behind.
- `staleness()` informant: active item unchanged for N turns → `Signal`
  (threshold in config). Signal, never a stop.

**Files.**
```
packages/plan/src/
  module.ts service.ts context.ts ops.ts
  tools.ts                  plan.* manifests + dispatch
  query.ts staleness.ts
  index.ts
```

---

## 10. `@domia/loop`

**Purpose.** The agentic harness. ONE loop (observe → step → act), a meta-tool
belt, and the deterministic ring around them: router, gates, informants, trace,
persistence. **No stages, no phases, no plans in code** — behavior lives in
persona prompts ([DESIGN.md §4](./DESIGN.md)). Still the only module that touches
agent AND tools AND plan.

**Contexts:** `LoopRun` (per run), `AgentLease` (internal, scoped agent alloc).
**Results:** `Outcome<RunReport>`.

### Engine (extension point `loop.engine`, singleton)

| Function | S/A | Signature | Notes |
|---|---|---|---|
| `registerMetaTool` | sync | `(h: MetaToolHandler) → void` | init-time; kernel resolves all `loop.metaTool` registrations |
| `personas` | sync | `() → readonly Persona[]` | from `prompts/personas/` + settings overrides |
| `alloc` | async | `(binding: RunBinding) → Promise<ModuleResult<LoopRun>>` | persists run row; heavy contexts alloc'd lazily at `start` |

```ts
export interface RunBinding {
  readonly caseCtx: CaseContext;
  readonly request: string;                 // the user's raw ask — the ONLY task input
  readonly options?: RunOptions;
  readonly parentRunId?: RunId;             // set for spawned children
}
export interface RunOptions {
  readonly questions?: 'allowed' | 'never';       // 'never' removes user.ask; prompt says "state assumptions"
  readonly approvals?: 'off' | 'dangerous';       // user-configured checkpoint on risk:'dangerous' tools (default 'off')
  readonly personas?: Readonly<Record<string, Partial<Persona>>>;  // per-run model/prompt overrides
  readonly budgetHints?: BudgetInformant;         // signals only — never self-terminating
}
export interface Persona {
  readonly id: PersonaId;                   // 'lead' | 'explorer' | 'verifier' | 'reporter' | custom
  readonly prompt: PromptRef;               // prompts/personas/<id>.md
  readonly provider?: string; readonly model?: string;
  readonly toolset: ToolsetSelector;        // 'full' | 'observe-only' | 'no-target' | explicit list
}
```

### LoopRun

| Function | S/A | Signature | Notes |
|---|---|---|---|
| `configure` / `inspect` | sync | informant thresholds, approvals; state: status, spend, turnCount, children | |
| `start` | async | `() → Promise<ModuleResult<Outcome<RunReport>>>` | allocs session + plan + lead agent, runs THE loop to terminal (S3) |
| `pause` / `resume` | async | `() → Promise<ModuleResult<void>>` | gate honored between turns and between calls |
| `cancel` | async | `(reason: string) → Promise<ModuleResult<void>>` | the ONLY hard stop besides process death |
| `answer` | async | `(reply: HumanReply) → Promise<ModuleResult<void>>` | resolves a pending `user.ask` / approval checkpoint |
| `events` | stream | `(signal?: AbortSignal) → AsyncIterable<RunEvent>` | turn / call / plan / signal / waiting / spawned / terminal |
| `dispose` | async | `() → Promise<void>` | disposes session, agents, plan context (data persists) |

### THE loop (one implementation, ~150 lines, `loop.ts`)

```
input ← { goal: request, observation: session.observe() }
turn  ← agent.step(input)
while turn = act:
    for call in turn.calls:
        result ← router.route(call)          every call: validate → span → execute → capture → record
        (failed call ⇒ descriptive Outcome.error — no retry logic, agent decides next move)
    signals ← informants.collect()           budget · duration · plan staleness · context pressure · idle
    turn ← agent.step({ toolResults, observation: session.observe({ifChanged}), signals })
turn = ask   → gate 'waiting_user' → reply → agent.step({ user: reply }) → continue
turn = final → RunReport { summary, verdict?, value?, plan snapshot, stats } → Outcome
```

### The router (`router.ts` — prefix table, deterministic)

| Prefix | Dispatched to |
|---|---|
| `browser.` `input.` `shell.` `fs.` `screen.` | `session.invoke(call)` |
| `plan.` | `planCtx.dispatch(call)` |
| `user.` `agent.` `context.` `skill.` `suspend` | registered `MetaToolHandler`s |
| anything else | failed `Outcome` (`UNKNOWN_TOOL`) — never a throw |

### Meta-tool belt (extension point `loop.metaTool`, multi)

```ts
export interface MetaToolHandler {
  manifests(run: LoopRunView): readonly ToolManifest[];   // sync; capability/option-gated
  dispatch(call: ToolCall, run: LoopRunInternals): Promise<ModuleResult<Outcome<ToolOutput>>>;
}
```

| Tool | Args | Effect |
|---|---|---|
| `user.ask` | `{ question }` | gate `waiting_user` → surfaces to UI/CLI → reply returns as the tool result (removed when `questions:'never'`) |
| `agent.spawn` | `{ persona, request, share? }` | child `LoopRun` (`parentRunId`), own `TargetSession` + conversation; returns `childRunId` immediately |
| `agent.await` | `{ runIds }` | joins children; **only their `final` summaries** return (context isolation) |
| `context.handoff` | `{ summary, nextFocus }` | fresh conversation seeded with handoff + plan + last observation; same run continues (V1 `iterate`) |
| `skill.save` / `skill.list` | `{ name, fromCallRange }` / `{}` | mint recording → `skill.<name>` composite tool; list available |
| `suspend` | `{ reason }` | snapshot + park (J5) |

`plan.*` manifests come from `@domia/plan` (§9) and join the same belt.

### Built-in personas (data, not code — `prompts/personas/*.md`)

| Persona | Model economics | Toolset | Prompt teaches |
|---|---|---|---|
| `lead` | strong | full belt | plan discipline, recovery style ("never retry the same action twice — diagnose, change approach"), when to ask/spawn/handoff/verify |
| `explorer` | cheap | observe-heavy, no `dangerous` | map the app, report structure, touch nothing |
| `verifier` | strong, fresh eyes | observe + assert-style | re-drive the app against acceptance criteria; report evidence |
| `reporter` | cheap | no target tools | synthesize summary/verdict from plan + trace digest |

**Events emitted:** `run.started`, `run.turn`, `run.call`, `run.plan.changed`
(relayed), `run.waiting_user`, `run.signal`, `run.spawned`, `run.terminal`.

```ts
// MIL: the composed execute — no spec, just a request
const run = (await engine.alloc({ caseCtx, request }))._unsafeUnwrap();   // Alloc
run.configure({ approvals: 'dangerous' });                                // Control (unattended box)
const report = await run.start();                                         // Execute
console.log(report.value.value.summary, report.value.meta.cost);          // GetResult
await run.dispose();                                                      // Free
```

**Kind.** K2 factory (`LoopRun`) + K3 meta-tool handlers.

**In the journeys.** The spine of J2–J5 and J9: the loop, router, gates,
informants, `waiting_user` (F6 idle auto-suspend), `agent.spawn` sub-runs.

**Implementation.**
- `loop.ts` is THE file — target ~150 lines; everything else feeds it.
- `router.ts` prefix table; unknown tool = failed `Outcome`, never a throw.
- One `gate.ts` awaited between turns AND between calls — pause/cancel/answer
  and the approval policy all pass through it.
- `informants.ts`: one collection point (after results, before next step) —
  budget, duration, plan staleness, context pressure, idle (F6).
- Meta-tools are each ~40 lines; personas are markdown — iterating on behavior
  never touches TypeScript (the research-system lesson).

**Files.**
```
packages/loop/src/
  module.ts engine.ts run.ts
  loop.ts router.ts gate.ts informants.ts personas.ts recovery.ts
  meta/{ask.ts, spawn.ts, handoff.ts, skills.ts, suspend.ts}
  index.ts
```

---

## 11. `@domia/api`

**Purpose.** The one facade. Same interface bound in-process (CLI), tRPC-over-IPC
(desktop), HTTP+SSE (headless). All functions **async** over the wire; streams for
live feeds. `ApiResult<T>` = wire-safe projection (plain data, no stacks, secrets
redacted).

| Namespace | Function | S/A | Notes |
|---|---|---|---|
| `cases` | `create / get / list / update / archive / validate` | async | mirrors CaseService |
| `runs` | `start(caseId, request, opts?: RunOptions) → RunId` | async | THE entry point — a raw request, no step lists, no modes |
| | `pause / resume / cancel / answer` | async | `answer` feeds `user.ask` + approvals |
| | `get(runId) → RunView` · `list(q) → Page<RunSummary>` | async | read models |
| | `watch(runId, signal?) → RunEvent` | stream | first emission = `sync` snapshot (`RunView`), then live events (F5) — late subscribers never miss state |
| `plans` | `get(runId) → Plan` · `history(runId)` | async | |
| | `watch(runId, signal?) → PlanRevision` | stream | live plan board |
| `traces` | `timeline(runId)` · `spanTree(runId)` | async | |
| | `artifact(id) → ArtifactStreamRef` | async | streamed/URL — never inlined base64 |
| `tools` | `catalog(target?)` | async | |
| `agents` | `providers()` · `models(providerId)` | async | |
| `settings` | `get / patch` | async | |

**Kind.** K1 service facade — one deliberate stateful exception: `RunRegistry`
(F1) holding live `LoopRun` handles.

**In the journeys.** The entry door of every journey; J4 depends on the
RunRegistry; J3 on watch's sync-first contract (F5).

**Implementation.**
- `runRegistry.ts`: `Map<RunId, LoopRun>` + eviction hooks (terminal/suspend);
  `answer/pause/cancel` = registry hit or `RUN_NOT_LIVE` (with resume hint).
- `watch`: emit `{ type: 'sync', view: RunView }` first, then bus events filtered
  by runId (F5).
- `unwrap.ts`: `ModuleResult`/`Outcome` → `ApiResult` — message + code only, no
  stacks, secrets redacted (V1 keeper).
- Transports live in hosts; this package exports the implementation + binding helper.

**Files.**
```
packages/api/src/
  module.ts api.ts runRegistry.ts readModels.ts unwrap.ts
  namespaces/{cases.ts, runs.ts, plans.ts, traces.ts,
              tools.ts, agents.ts, settings.ts}
  index.ts
```

---

## 12. `@domia/ui`

Not an API module — a consumer. Contract: imports only the `DomiaApi` type + the
transport client; renders from read models + streams; zero Node access
(sandboxed renderer, V1 posture).

```
ui/
  app/          shell, routing, theme
  api/          DomiaApi client (tRPC-IPC binding)
  features/
    cases/      list · editor · validation panel
    runs/       launcher (case + request + options) · run list
                LIVE RUN VIEW: activity lane · plan board (plans.watch)
                · turn/call feed with before/after screenshots
                · question/approval cards inline (runs.answer) · cost meter · signals
    trace/      timeline · span tree · filmstrip · video player
    settings/   providers, models, keys, role model overrides
  ui/           shared primitives
```

Everything the live view renders comes from the same trace/plan data replay tests
consume — one source of truth, no UI-only state derivations.

**Kind.** Consumer — exempt from the lifecycle.

**In the journeys.** J1 case editor, J3 flagship live view (question card, plan
board via `plans.watch`, filmstrip via `domia-artifact://` F4), J4 controls,
J6 trace tab, J7 settings.

**Implementation.**
- Server state via TanStack Query keyed on api calls; live streams reduce into
  per-run zustand slices; nothing re-derived that trace already knows.
- Screenshot/video `src` = `domia-artifact://<sha256>` (desktop protocol, F4) —
  refs in, streams out, no base64 over IPC.
- Built at slice 6 — the CLI is the dev surface until then.

---

## 13. `@domia/cli`

Same api, terminal-shaped. All commands support `--json`; exit code maps run
outcome (`0` ok · `1` failed · `2` cancelled · `3` error).

| Command | Maps to |
|---|---|
| `domia run "<request>" --case <id> [--no-questions] [--approvals off\|dangerous] [--watch]` | `runs.start` (+ `runs.watch`) |
| `domia run list / show <runId> / cancel / resume / answer <runId> "<text>"` | `runs.*` |
| `domia plan show <runId> [--follow]` | `plans.get` / `plans.watch` |
| `domia case add / list / show / validate <…>` | `cases.*` |
| `domia trace show <runId> [--tree]` | `traces.*` |
| `domia tools list [--target web\|electron\|desktop]` | `tools.catalog` |
| `domia agent providers / models <provider>` | `agents.*` |
| `domia doctor` | host checks: drivers, providers, db, disk |

Interactive niceties: `--watch` renders the activity lane + plan board in-terminal;
`run answer` is prompted automatically when a watched run hits `waiting_user`.

**Kind.** Consumer — exempt from the lifecycle.

**In the journeys.** J0 doctor, J1 `case add`/`case auth`, J2 flagship
(`--watch` lane), J5 resume, J6 `trace show`, J9 CI (`--json`, exit codes).

**Implementation.**
- commander; each command = one thin file calling one api namespace; all
  rendering isolated in `render/`.
- In-process boot by default; `--daemon <url>` switches the same client to HTTP
  (headless host).
- Interactive `waiting_user` prompt only when TTY + `--watch`; otherwise print a
  resume hint (keeps J9 non-blocking).

**Files.**
```
packages/cli/src/
  index.ts boot.ts
  commands/{run.ts, case.ts, plan.ts, trace.ts,
            tools.ts, agent.ts, doctor.ts, settings.ts}
  render/{lane.ts, planBoard.ts, table.ts, json.ts}
```

---

## 14. Hosts

The only packages importing everything (rule D5).

| Function | S/A | Signature | Notes |
|---|---|---|---|
| `bootHeadless` | async | `(cfg: HostConfig) → Promise<ModuleResult<Kernel>>` | kernel + all modules + user plugins + HTTP/SSE transport; what tests boot |
| `bootDesktop` | async | `(cfg) → Promise<ModuleResult<Kernel>>` | same boot + Electron shell (window, agent WebContentsView, IPC transport, renderer mount) |
| `loadUserPlugins` | async | `(dir: string) → Promise<ModuleResult<readonly DomiaModule[]>>` | reads `domia-plugin.json` manifests; same `ModuleHost` as built-ins (D6) |

```ts
// @domia/headless
export async function bootHeadless(cfg: HostConfig) {
  const kernel = createKernel(cfg);
  return kernel.load([
    traceModule(), storeModule(), toolsModule(), agentModule(),
    caseModule(), planModule(), loopModule(), apiModule(),
    ...(await loadUserPlugins(cfg.pluginsDir))._unsafeUnwrap(),
  ]).map(() => kernel);
}
```

**Kind.** Composition roots — exempt (rule D5: the only importers of everything).

**In the journeys.** Invisible everywhere: desktop hosts J1/J3/J4/J6/J7 (+ the
`domia-artifact://` protocol, F4); headless hosts J9 and any remote daemon.

**Implementation.**
- Desktop: Electron main stays thin — boot kernel, window + agent
  WebContentsView, tRPC-IPC bridge, artifact protocol handler, V1 security
  posture (sandbox, contextIsolation, Zod-validated IPC).
- Headless: Fastify + SSE for `watch`/`plans.watch`; binds `127.0.0.1` unless
  configured.
- Both read one `HostConfig` (cosmiconfig): db path, artifacts dir, plugins dir,
  provider auth.

**Files.**
```
packages/hosts/desktop/src/{main.ts, window.ts, ipc.ts,
                            artifactProtocol.ts, menu.ts}
packages/hosts/headless/src/{main.ts, server.ts, sse.ts}
```
