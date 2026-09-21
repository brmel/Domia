# Design Decisions — problems found while writing the interface specs

Each entry: the problem the earlier docs left unresolved (or got wrong), and the
fix now baked into the specs. These supersede DESIGN/MODULES where they conflict;
those docs are being patched to match.

---

### D1 — `Outcome<T>` was type-unsound (value defined "only when ok")

**Problem.** `Outcome<T> { value: T; error?: DomiaError }` claims a `T` even on
failure. Callers get a lie from the type system.
**Fix.** Discriminated union on `status`:

```ts
type Outcome<T> =
  | { status: 'ok';        value: T;    meta: OutcomeMeta; toJSON(): unknown }
  | { status: 'failed' | 'cancelled' | 'timeout' | 'suspended';
      error: DomiaError; meta: OutcomeMeta; toJSON(): unknown };
```

`value` exists only on the `ok` arm; the compiler forces a status check.
Helpers `ok(value, meta)` / `fail(status, error, meta)` in contracts.

### D2 — two error layers (`ModuleResult` + `Outcome`) had no crisp rule

**Problem.** Methods return `Promise<ModuleResult<Outcome<T>>>` — when is a
failure the outer `Err` vs the inner `failed` Outcome? Left vague.
**Fix, stated once and mechanical:**
- **Outer `ModuleResult.Err`** = *could not start / contract broken*: bad config,
  Zod-invalid args, unknown tool, target not allocatable, provider auth missing.
  No execution happened; nothing to trace as a run event.
- **Inner `Outcome.failed`** = *ran, produced a bad result*: click missed, LLM
  returned malformed tool call after retries, assertion false, MCP tool errored.
  This is domain data — traced, replayable, fed back to the agent.
- Rule of thumb: if the agent should see it and react, it's an `Outcome`; if the
  caller (loop/api) mis-wired something, it's an `Err`.

### D3 — `host.resolve<T>(point)` was stringly-typed

**Problem.** `resolve<T>('loop.engine')` makes the caller assert `T`; a typo or
wrong `T` compiles.
**Fix.** Extension points are typed tokens carrying their interface:

```ts
interface ExtensionPoint<T> { readonly id: string; readonly arity: 'one' | 'many' }
const EP = {
  Tracer:        ep<Tracer>('trace.tracer', 'one'),
  TraceSink:     ep<TraceSink>('trace.sink', 'many'),
  Store:         ep<Store>('store.main', 'one'),
  ToolProvider:  ep<ToolProvider>('tools.provider', 'many'),
  ToolService:   ep<ToolService>('tools.service', 'one'),
  AgentService:  ep<AgentService>('agent.service', 'one'),
  CaseService:   ep<CaseService>('case.service', 'one'),
  PlanService:   ep<PlanService>('plan.service', 'one'),
  MemoryService: ep<MemoryService>('memory.service', 'one'),
  LoopEngine:    ep<LoopEngine>('loop.engine', 'one'),
  MetaTool:      ep<MetaToolHandler>('loop.metaTool', 'many'),
} as const;
host.resolve(EP.Store)         // : ModuleResult<Store>
host.resolveAll(EP.ToolProvider) // : ModuleResult<readonly ToolProvider[]>
```

Arity is enforced at registration (a `'one'` point double-registered = load error).

### D4 — tracer bootstrap was circular

**Problem.** `ModuleHost.tracer` is provided by the trace module, but the trace
module needs a host (with a tracer) to init. Chicken/egg.
**Fix.** `trace` is a **core module**, not a provider — kernel loads it first
(alongside contracts/kernel as "ground"). Until trace registers its tracer, the
kernel hands out a `NoopTracer` (spans are no-ops, artifacts error). After trace
loads, later hosts get the real tracer. Trace's own init runs under NoopTracer —
acceptable, it has nothing to trace yet. This is the one ordering privilege; it is
not a *capability* privilege (trace uses the same `DomiaModule`/`register` API).

### D5 — the agent proposes calls without our `callId`

**Problem.** `AgentTurn.act.calls: ToolCall[]` but the model can't mint our
branded `CallId`. Who stamps it?
**Fix.** Split the type. The agent emits `ProposedCall { name; args }`; the loop's
router stamps `callId` (and `runId`, `turnSeq`) to make a `ToolCall`. Trace/replay
key on the stamped id.

```ts
interface ProposedCall { readonly name: ToolName; readonly args: Record<string, unknown> }
interface ToolCall extends ProposedCall { readonly callId: CallId; readonly timeoutMs?: number }
type AgentTurn =
  | { kind: 'act'; calls: readonly ProposedCall[]; thought?: string }
  | { kind: 'ask'; question: string }
  | { kind: 'final'; summary: string; verdict?: 'pass'|'fail'; value?: unknown };
```

### D6 — observing every turn is wasteful; playwright-mcp already returns state

**Problem.** The loop did `session.observe()` every turn AND every tool returns a
snapshot (playwright-mcp does). Double perception cost + tokens.
**Fix.** `invoke` returns the post-action `Observation` inside its `Outcome`
(`ToolOutput.observation?`). The loop feeds that forward; it calls the standalone
`observe` only (a) once at run start, and (b) when the agent explicitly asks
(`browser.observe` / no acting tool ran). `changedSinceLast` lets the loop skip
re-sending an unchanged snapshot. Cheaper loop, same information.

### D7 — who composes the toolset the agent sees?

**Problem.** `AgentConfig.tools` must be target tools + `plan.*` + `memory.*` +
meta belt, gated by persona selector + case policy. Unspecified owner.
**Fix.** New `ToolsetComposer` in `@domia/loop` (not agent, not tools). At each
`agents.alloc` it merges: `session.manifests()` ∪ `plan.toolManifests()` ∪
`memory.toolManifests()` ∪ meta-tool manifests, then filters by
`persona.toolset` selector ∩ `caseCtx.toolPolicy` (R6/F11). The agent module
stays dumb about where tools come from.

### D8 — MCP servers: per-session vs shared

**Problem.** playwright-mcp must be per-`TargetSession` (browser hygiene) but a
`github` MCP server is stateless-per-session; spawning it per run wastes
processes and login.
**Fix.** Providers declare scope. `ToolProvider.scope: 'session' | 'shared'`.
Session-scoped attach/dispose with the session; shared servers are pooled by the
`McpServerManager` (kernel-tracked, ref-counted, disposed at shutdown). Case
mounts may override (`mcpServers[].scope`).

### D9 — parallel calls in one `act` turn

**Problem.** `act.calls` is a list — sequential or parallel? Browser calls share
one page (must serialize); independent MCP calls could parallelize.
**Fix.** Sequential by default (deterministic trace + safe for shared page). A
manifest may set `parallelSafe: true`; the router batches a contiguous run of
parallel-safe calls to different providers with `Promise.all`, preserving result
order. v1 ships sequential-only; the flag is reserved.

### D10 — `snapshot`/`restore` must be provider-expressible

**Problem.** Suspend/resume needs the conversation serialized, but AI SDK owns the
message array. Can every provider round-trip it?
**Fix.** `ConversationSnapshot` is provider-tagged opaque JSON
(`{ provider: string; version: string; blob: unknown }`). `AiSdkProvider` stores
the AI SDK `messages` + tool state; `ReplayProvider` stores the cursor. The
conformance kit asserts `restore(snapshot(x)) ≡ x` behaviorally. No shared schema.

### D11 — `case` importing `tools` for auth capture breaks the layer

**Problem.** `CaseService.captureAuth` needs a headed `TargetSession`, but case is
a domain module that must not import tools' package.
**Fix.** captureAuth takes a session **factory injected by the loop/api layer**,
resolved via `host.resolve(EP.ToolService)` at call time — case depends on the
*interface* (contracts), never the package. Same pattern the loop uses. Documented
so it isn't "re-fixed" as a violation.

### D12 — unattended runs must never hang on `user.ask`

**Problem.** J9/J10: a scheduled or MCP-driven run with no interactive surface
calls `user.ask` → hangs forever.
**Fix.** `RunOptions.interactive: boolean` (api sets it: true for UI/CLI-watch,
false for schedule/MCP). When false, `AskHandler` degrades an `ask` to
`suspend + notify` immediately (F10). The agent's prompt is told, so it prefers
stating assumptions.

---

## Found while building slice 0 (contracts + kernel + trace + cli doctor)

The scaffold compiled and `domia doctor` ran green + wrote `trace.jsonl`. Building
it surfaced four issues the docs had missed — logged here, fixed in code + specs.

### D13 — a non-blocking sink's `flush` must await the in-flight drain

**Found:** `JsonlSink.write` fired `drain()` fire-and-forget; `flush()` early-returned
when a drain was already running. So `flush()` resolved *before* buffered writes
hit disk — `domia doctor` saw `trace.jsonl` missing though the data arrived a tick
later. The "flush at run terminal" durability guarantee was fake.
**Fix:** `flush` awaits the current drain promise, then drains again if the queue
refilled. **Contract:** `TraceSink.flush`/`Tracer.flush` MUST await pending writes;
the `traceSinkKit` conformance test asserts *write → flush → bytes present*.

### D14 — logs go to stderr, command output to stdout

**Found:** pino defaulted to stdout, so `domia doctor --json` emitted a log line
before the JSON and broke parsing.
**Fix:** kernel's root logger writes to **stderr** (`pino.destination(2)`). Rule:
all `Logger` output is stderr; only command results/data go to stdout. Keeps
`--json` and pipes clean. Applies to every surface (CLI, hosts).

### D15 — `exactOptionalPropertyTypes` forces a spread idiom + one Result source

**Found:** with `exactOptionalPropertyTypes: true`, `{ x: maybeUndefined }` does
**not** satisfy an optional `x?: T` — you must conditionally spread. Hit it in
`domiaError`, `outcomeFail`, `SpanImpl`, the host boot. Also: importing `ok`/`err`
straight from `neverthrow` (as `resultOk`) failed — the names differ.
**Convention (now enforced by habit + review):**
- Build optionals with `...(v !== undefined ? { k: v } : {})`, never `{ k: v }`
  where `v` may be `undefined`.
- Import Result/Outcome helpers from **`@domia/contracts`** (`resultOk`,
  `resultErr`, `outcomeOk`, `outcomeFail`), never from `neverthrow` directly, so
  there is one source and the boundary stays clean.

### D16 — `Tracer` port was missing `flush()`

**Found:** `TracerImpl` had `flush()` (called by trace's `dispose`), but the
`Tracer` interface in contracts did not — so anything resolving `EP.Tracer` (the
loop, at run terminal) could not flush. An incomplete port.
**Fix:** added `flush(): Promise<void>` to `Tracer`; `NoopTracer` no-ops it. This
is the run-terminal durability hook the loop will call in slice 3.

**Validated by running (no change needed):** D1 discriminated `Outcome`, D3 typed
`ExtensionPoint<T>`, D4 NoopTracer→real swap (doctor resolved the real tracer
because trace loads first and the host getter re-reads). The MIL context/result
discipline compiled cleanly end to end.

**Deferred correctly:** `TracingMiddleware` + `ContextTracker` (kernel spec) are
slice-1 deliverables — they wrap K2 factories, and slice 0 has none yet.

---

## Interface-wide conventions (apply to every spec below)

- Every async fn: `Promise<ModuleResult<…>>`. Every execute: `…<Outcome<…>>` (D1/D2).
- Contexts: `configure`/`inspect` sync; `dispose` async idempotent; kernel-tracked.
- No package imports another package; cross-module only via `host.resolve(EP.*)`.
- Errors are `DomiaError` with a typed `code`; never throw across a boundary.
- Zod schema per wire/row type in `contracts/schemas/`; validate at edges.

### D17 — playwright-mcp returns action snapshots as file links, not inline (spike, slice 1)

**Found (by spiking playwright-mcp before building):** `browser_snapshot` returns
the ARIA tree inline as YAML with `[ref=eN]` refs — exactly as designed. But
**action tools** (`browser_navigate`, `browser_click`, …) return a *file link*
(`.playwright-mcp/page-*.yml`) plus URL+title inline, NOT the inline tree. This
clashed with D6 ("observation rides the tool output").
**Fix (provider absorbs it, contract unchanged):** `McpToolProvider` synthesizes
the `Observation` — after an action it issues one extra local `browser_snapshot`
call to get the inline tree, and packages it as `ToolOutput.observation`. From the
loop, D6 still holds. Extra cost is one stdio round-trip on the same page (no
re-render) — negligible. Also: run playwright-mcp with `--output-dir` in a
per-session temp dir and clean up (it writes yml/screenshot files there).
**Also confirmed:** `browser_click` needs `{ element: <human description>, target:
<ref> }` — ref-based acting requires a description arg (playwright-mcp permission
model). Our manifest exposes both; the agent has the description from the snapshot.
Tool names are `browser_*` (underscore); we map to `browser.*` (dot) so the
slice-3 router prefix works, mapping back on execute.

### D18 — dynamic providers discover manifests at attach, not statically (slice 1)

**Found (building `McpToolProvider`):** `ToolProvider.manifests(target)` was spec'd
as a static preview, but an MCP server's tools are only known **after connecting**
(`listTools`). Returning `[]` statically then a real set post-attach is confusing.
**Fix:** `ToolBinding` now carries `manifests(): readonly ToolManifest[]` (live) and
an optional `observe(opts?)`. The session's `manifests()`/`observe()` delegate to the
binding. `ToolProvider.manifests(target)` stays as a best-effort static catalog
preview (empty for dynamic providers); the authoritative list is the binding's.
Contract updated in `contracts/tools.ts`.

**Validated end to end (slice 1 demo):** `domia tools invoke https://example.com
--steps click:e6` → session offered 24 tools, `observe()` returned the inline ARIA
tree with `[ref=eN]`, `browser.click e6` navigated to iana.org, and the post-action
observation carried the new URL/title (D6 via D17 normalization). `tool.invoke` and
`tool.observe` spans landed in `trace.jsonl`. The MIL context/result discipline
holds over a real MCP server.

### D19 — LLM tool names can't contain dots (slice 2 spike)

**Found:** function-calling schemas require `/^[a-zA-Z_][a-zA-Z0-9_]*$/`, but our
tools are `browser.click`, `plan.start_item`, `user.ask`. Naive dot↔underscore is
lossy (`plan.start_item`→`plan_start_item`→`plan.start.item`).
**Fix:** `NameMap` (agent) — reversible sanitized↔original map built per alloc;
declare sanitized names to the SDK, restore originals when reading tool calls back.

### D20 — AI SDK v7 rejects `system` role in messages (slice 2)

**Found:** pushing `{ role:'system' }` into `messages` → "System messages are not
allowed… Use the instructions option instead."
**Fix:** pass the system prompt as `generateText({ system })`, not a message.

### D21 — MCP tool JSON Schema must become a real Zod schema (slice 3, CRITICAL)

**Found (first autonomous run):** the agent's `browser.click` failed every time —
it sent `{ ref: 'e6' }` but playwright-mcp needs `{ element, target }`. Root cause:
our JSON-Schema→Zod mapping was a stub (`z.object({}).passthrough()`), so the model
got **no parameter info** and guessed. The same click worked in slice 1 only because
the CLI hand-wrote the args.
**Fix:** `schemaMap.ts` — a real JSON-Schema→Zod converter (object/string/number/
integer/boolean/array/enum/anyOf + descriptions + required). Now the model sees the
true params. Re-run: agent sent `{ element:'link "Learn more"', target:'e6' }` →
click OK → navigated → correct final answer in 2 turns. **Lesson: a permissive
"passthrough" schema is a silent correctness bug for LLM tool use — the schema IS
the model's API doc.** The `metaToolKit`/`toolProviderKit` must assert manifests
carry non-empty parameter schemas for tools that take arguments.

### D22 — kernel.load must roll back on partial failure (review, safety)

**Found (review):** if module N failed init, modules 1..N-1 stayed initialized but
`load` returned Err — and callers that don't call `shutdown` on error leaked live
resources (browsers, MCP servers, DB handles).
**Fix:** on any init failure or throw, `load` now disposes everything already
loaded (reverse order) before returning the error. Boot is all-or-nothing.

### D23 — trace spans were flat, not a run→tool tree (review, observability)

**Found (review):** `session.invoke`/`observe` each called `tracer.span()`, which
minted a **new root trace** — so a run produced several disconnected traces instead
of one run→tool tree (a stated core goal). `Outcome.meta` also carried placeholder
trace/span ids in some paths.
**Fix:** `Tracer.withSpan(name, attrs, fn)` — a scoped span that auto-nests under
an **ambient** span (tracked with `AsyncLocalStorage`, so it survives awaits and
isolates concurrent runs) and auto-ends ok/failed. `runLoop` opens the `run` span
with `withSpan`; every `session.invoke`/`observe`/`agent.step` inside nests
automatically and threads the real span ids into `Outcome.meta`. Verified: a run
now emits **one** traceId with `run` as root and `tool.*`/`agent.step` as children.

### Review cleanups (safety/types, no new contract)

- **CLI input validation** (`cli/src/parse.ts`): `provider:model`, URL, and turn
  count are validated with clear errors — replaced unsafe `x!` splits that silently
  produced `undefined`.
- **MCP connect timeout** (30s, `.unref()`): a hung/missing playwright-mcp can no
  longer wedge a run; `connect` closes the transport on failure.
- **Empty model chain** guarded (`BAD_CONFIG`) instead of `chain[0]!`.
- **No `console.*` outside the CLI**: kernel event-stream drop-oldest no longer
  warns to console.
- **Secret safety confirmed:** `Outcome.toJSON` strips `error.cause`; provider auth
  errors carry no key (Google sends it as a header, not in the URL); `loadEnvKeys`
  never logs values.

### D24 — SQLite engine: node:sqlite built-in, not better-sqlite3 (slice 4)

**Decision:** use Node's built-in `node:sqlite` (`DatabaseSync`) instead of
`better-sqlite3`. Same synchronous semantics, but **zero native build** (better-sqlite3
needs node-gyp/prebuilds that fail in constrained environments). It is flagged
experimental; acceptable pre-1.0. The `Store` interface stays fully async so the
engine remains swappable (S2) — repos wrap the sync calls in `Promise.resolve`.

### Slice 4 — store + case + persistence (built)

- **StoreSink lives in `@domia/store`, not trace.** A trace sink that persists to
  SQLite needs the `Store`; trace is core (loads first) and can't depend on store.
  So store registers a `StoreTraceSink` as an `EP.TraceSink` when it loads.
  **The tracer resolves sinks live** (`() => host.resolveAll(EP.TraceSink)`) instead
  of snapshotting them at init, so a sink registered after trace is still fanned to.
- **runId propagates through the ambient span context.** `withSpan('run', {runId})`
  puts runId in the `AsyncLocalStorage` ambient; every child span inherits it →
  all spans of a run carry `run_id` and are queryable per run (verified: 5 spans,
  cost rolled up to the run).
- **`RedactionFilter` runs in `tracer.fan` before any sink** — strips `secret://`
  refs and secret-shaped keys (api_key/token/password/…) recursively. Verified:
  `api_key`→`[redacted]`, `secret://` ref→`[redacted]`, normal `url` kept.
- **`ContextTracker` (kernel) deferred, not built.** It needs a factory-registration
  middleware convention we don't have yet; adding an unwired tracker would be dead
  code. Current dispose discipline (per-context `finally` + reverse module dispose +
  D22 load rollback) covers single-host today. Revisit when a factory seam exists.
- **`case` reserved-word:** `CaseContext.case` can't be a constructor
  parameter-property (`case` is reserved) — declared as a field, assigned in the body.

### D25 — Gemini "thinking" exhausts the output budget → empty responses (slice 5)

**Found (building the plan belt):** with the full setup — the 2661-char lead
persona prompt + 32 composed tools + a 6337-char page snapshot — gemini-2.5-flash
returned `{ kind:'final', summary:'' }`: no text, no tool call. It was
intermittent on small pages, consistent on large ones. Root cause: Gemini's
default *thinking* consumes the output token budget on large tool+context inputs,
leaving nothing for the actual response. The loop treated the empty response as a
(premature, empty) completion.
**Fix (in the aisdk adapter, where provider quirks belong — like D17/D20):**
1. Disable thinking for tool-driving by default (`providerOptions.google.
   thinkingConfig.thinkingBudget = 0`, overridable via `AgentConfig.thinking`);
   tool-calling doesn't need deep thinking and it frees the output budget.
2. Defence-in-depth: if a step still returns empty (no text, no call), retry the
   generation once before trusting it.
**Verified:** the same planning task now runs the full living-plan flow —
`plan.propose` → `plan.start_item` → `browser.click` → `plan.complete_item` — and
finishes with plan **rev 5, settled**, both items done with evidence notes.

### Slice 5 — plan module + LoopEngine/LoopRun + meta belt (built)

- **Anti-god-object refactor done.** `startRun` was a growing function; it is now a
  thin orchestrator over `LoopEngine.alloc → LoopRun`. The `LoopRun` is a K2 context
  (`start/pause/resume/cancel/answer/events/dispose`) implementing both the contract
  and a concrete `RunInternals` that meta handlers receive. Execution logic lives in
  `LoopRunImpl.drive`, not in the orchestrator. This is the seam that keeps slices
  6–9 additive.
- **`ToolRouter` is extensible:** prefix `browser./…` → session, `plan.*` → plan
  context, everything else → a registry of `MetaToolHandler`s (`EP.MetaTool`).
  Built-ins `user.ask` (D12 degrade when non-interactive) and `suspend` (snapshot +
  park). Third parties add belt tools without touching the loop.
- **`ToolsetComposer` (D7)** merges target ∪ plan ∪ meta manifests, gated by the
  persona `toolset` selector ∩ case tool policy. `PersonaRegistry` loads
  `prompts/personas/*.md`.
- **Exchange tape persisted:** every agent turn + tool call is appended to
  `exchanges` (append-only) — the replay source. Plan revisions persist to
  `plans`/`plan_items`/`plan_revisions`.
- **Deferred (noted):** ~~`context.handoff` + `agent.spawn/await` (the remaining belt
  tools); the plan `staleness` informant; wiring `ReplayProvider` to read the tape~~
  — **all landed** (see D27–D31). None block the slice.

### D27 — sub-runs: agent.spawn / agent.await (parallel lanes, one case)

`SubRunCoordinator` (loop `meta/subruns.ts`) is a belt tool registered after the
engine (it needs `engine.alloc` to launch children). `agent.spawn {request, persona?}`
allocs a child run reusing the parent's read-only `caseCtx`, owns the child's
run-row lifecycle exactly as the host's `startRun` does (insert `status:'running'`
with `parentRunId` before start — plan/tape rows FK to it — then update terminal
after), drives it in the background, and returns `{childRunId}` immediately.
`agent.await {childRunId?}` joins one child or all this run's children and returns
their reports. Children are independent lanes (own session/agent/plan); the tree is
queryable via `runs.children(parentRunId)`.

### D28 — plan staleness is an informant, never a stop

`PlanContext.staleness()` is polled once per drive turn (the natural tick): it
counts turns since the last `apply` (reset on any revision) and, once an **active**
plan crosses `staleAfterTurns` (default 5), returns a `plan_stale` Signal. The drive
loop folds pending signals into `StepInput.signals` (which the aisdk provider already
renders) and emits a `signal` RunEvent for the UI. Advisory only — it nudges the
agent to revise/complete items; it never blocks a turn.

### D29 — replay a past run from its recorded tape

Agent exchanges persist the full `AgentTurn` as their payload, so replay is just:
read `exchanges` (direction `agent`) in order → feed them to `ReplayProvider` as the
script. `hosts.replayRun(runId)` is two-phase: boot to read the tape + case/request,
then boot a replay-backed kernel and re-drive the same case (tools re-execute for
real; only the agent's decisions are scripted). CLI: `domia replay <runId>`.

### D30 — @domia/api facade + RunRegistry (F1/F5) + Scheduler (R5)

The one facade UI/CLI/domia-mcp consume, resolving domain services from the kernel
(deps: contracts + kernel only). `RunRegistry` is the single stateful exception (F1):
`runs.start` allocs the chain, persists the row, and drives in the **background**
(non-blocking) holding the live `LoopRun` for pause/cancel/answer; evicts on terminal
(control after that → `RUN_NOT_LIVE`). `watch` is sync-first (F5): a `{type:'sync'}`
snapshot then live events. `TimelineEntry` is a facade read model over
store spans+tape+artifacts (no `EP.TraceQuery` needed). `Scheduler` (R5) ticks a
minimal cron (`@every Ns/m/h/d`, `@hourly`, `@daily`) → `runs.start({interactive:false})`.

### D31 — Domia served as MCP (E6) + conformance kits + context.handoff

- `@domia/domia-mcp` projects the `DomiaApi` facade as five MCP tools
  (`domia_run_start/status/answer`, `domia_case_list`, `domia_trace_timeline`);
  non-blocking by contract (start returns a runId, host polls status).
- `@domia/conformance` ships framework-agnostic `TestSuite` kits
  (`agentProviderKit`, `metaToolKit`, `traceSinkKit`) — passing the kit *is* the
  definition of a valid provider; `ReplayProvider`, the builtin belt handlers, and
  `JsonlSink` all pass theirs.
- `context.handoff` belt tool (R2): `requestHuman(reason,'takeover')`; degrades to
  suspend when unattended (D12). The physical `TargetSession.setHeaded` browser-flip
  still needs a display and is not yet implemented.

### D26 — web scraping is a pluggable target driver, not Playwright-only (autopsy G)

**Problem:** V1 hard-wired Playwright as the only way to reach a web page (autopsy
G — it leaked through four port families). V2 must let many backends scrape a
`web` target (browserless HTTP, firecrawl, crawl4ai, …) without the loop knowing
which one runs.

**Fix:** any scraper is a `role:'target'` `ToolProvider` behind the same
`TargetSession` (`invoke`/`observe`). More than one can `supports` a `web` target,
so selection became explicit: `pickDriver` = `SessionOptions.driver` (hint) →
`ScopedConfig` `tools.driver.<kind>` (setting) → first registered driver
(playwright stays the default first-match; back-compatible). Unknown id → `Err
BAD_CONFIG` listing the available drivers.

**Shipped drivers:**
- `fetch-scrape` — built-in, zero-dep HTTP GET → markdown/text/links
  (`providers/fetch/`). Fast path for static/server-rendered pages; `observe`
  returns a `native` markdown snapshot.
- `firecrawl` / `crawl4ai` — `McpScrapeProvider` wraps any scraping MCP server as a
  driver (`providers/scrape/mcpScrape.js`). A new service is a `ScrapeServiceSpec`
  config object (launch + required env + seed tool), not a new class. API keys read
  from the environment; missing key → `PROVIDER_AUTH` only when that driver is
  selected.

**Verified:** hermetic `scrape.test.ts` — local HTTP server, `driver:'fetch-scrape'`
drives the target with `fetch.*` tools and a markdown observation, unknown driver
rejected, all four drivers registered. Playwright default path (existing
`tools.test.ts`) unchanged.

### D32 — UI seam is a transport-agnostic API router, not tRPC-over-IPC

**Problem:** the desktop `IpcBridge` spec called for tRPC-over-IPC. tRPC couples the
seam to Electron's ipc and adds a dependency, and the same seam is needed by the
headless WS gateway (R8) — two transports, one surface.

**Fix:** `createApiRouter(api)` (hosts `ipc.ts`) is Electron-free. It exposes an
**allowlisted** `invoke(path, args)` over every `DomiaApi` method and a
`watch(path, args, onEvent, signal)` that multiplexes the async-iterable streams
(`runs.watch`/`plans.watch`) to a callback. Paths off the allowlist are refused
(no arbitrary method access — the security boundary). The Electron `ipcMain.handle`
wiring and the WS gateway both become ~thin adapters over this one router. Tested
in-process (no Electron, no display): invoke round-trip, allowlist refusal, live run
streamed sync-first to terminal.

**Still display-gated (not built):** the Electron shell (`hosts/desktop`: main,
window, preload, artifact protocol) and the `@domia/ui` React renderer — their
correctness (preload path, renderer URL, protocol timing, window lifecycle, layout)
is only validated by running with a display. The seam above is the run-verified part.

### D33 — v1→v2 parity map: what actually blocks deleting v1

Surveyed v1's real surface (not the aspirational INTERFACE lists).

**v1 ships:** a Web driver (playwright) + a `VisionSensor` (screenshot capture fed to
a multimodal model); frontend features runs/skills/plugins/workflows; the desktop
Electron shell. There is **no** shipping macOS-AX or native-input desktop-app
automation in v1 — those were never built there.

**Covered by v2 (≥ v1):** web automation (ARIA refs + multi-scraper drivers, D26 —
richer than v1's single playwright path); runs/plan/replay/suspend-resume; skills,
plugins, memory (backends, tested); the agentic loop with spawn/await, informants,
no hard limits (exceeds v1).

**Real blockers to deleting v1:**
1. **UI run-verification.** The desktop shell (`@domia/hosts-desktop`) + renderer
   (`@domia/ui`) are built and typecheck green, but GUI-run verification needs a
   display (`npm run app`). This is the gate.
2. **UI breadth.** The renderer covers cases / live-runs / trace / settings. Skills,
   plugins and memory views need `DomiaApi` namespaces added first (the facade has
   none today). Workflows are intentionally dropped (autopsy E).
3. **Vision (pixels→model).** v2 is ARIA-first by design (R1: structured before
   pixels) and does not send screenshots to the multimodal model, though it captures
   them as artifacts. A `vision` fallback would close the gap for pixel-only tasks;
   it's an architectural choice, not a hard blocker.

**Not parity blockers (over-scoped in earlier plans):** `os-a11y`, `native-input` —
absent from v1; they remain v2-future, not prerequisites for retiring v1.

### D34 — full v1→v2 feature audit (gate for deleting v1)

Exhaustive map of v1's surface to v2. Supersedes the partial D33.

**Agent tools (v1 `infrastructure/tools/catalog/*` → v2):**
| v1 catalog | v2 |
|---|---|
| navigation (navigate/back/forward/reload) | `browser.navigate*` (playwright-mcp) ✓ |
| interaction (click/type/press/select/hover/drag) | `browser.*` ✓ |
| observation / snapshot | `browser.snapshot` + `observe` (D6) ✓ |
| tab | `browser.tabs` ✓ |
| polling / wait | `browser.wait` ✓ |
| shell / terminal | `shell.exec` ✓ |
| electron | electron target over CDP ✓ |
| subrun | `agent.spawn`/`agent.await` (D27) ✓ |
| snapshot-recording | skills recording ✓ |
| evaluate / extractText | `browser.evaluate` / snapshot + fetch scraper ✓ |
| meta (categories) | persona toolset selectors ~✓ |
| mouse (coordinate) | playwright-mcp vision caps ~✓ |
| — | **v2 adds:** `fs.*`, multi-scraper (fetch/firecrawl/crawl4ai, D26) |

**Backend (v1 `backend/*` → v2):** the 20-service `runs/*` constellation →
one loop + meta belt + spawn/await + replay (D29) + suspend/resume + informants
(autopsy A) ✓; `skills` → @domia/skills ✓; `plugins` → loadUserPlugins ✓;
`settings` → settings namespace ✓; `prompts` → persona prompts ✓; `observation`
→ observe + D6 ✓; `platform` → allocSession + gating ✓; `policy/readiness` →
informants (demoted, intentional) ✓; `events` → kernel events + RunEvents ✓.
Deliberately dropped: `workflows/*` (autopsy E) and budget vetoes (no hard limits).

**Frontend (v1 → v2 ui):** runs ✓ (live view, richer) · skills ✓ · settings ✓ ·
cases ✓ (new). Dropped: workflows (intentional). Thin: a dedicated **plugins**
view — substance is covered by `tools.catalog` (capabilities) + `toolPolicy`
(enable/disable), but there is no plugins screen.

**Fixed during the audit — the real "agent was limited" bug:** the aisdk provider
had no `finish` tool, so a real LLM could never terminate a task (it flailed to the
turn ceiling). Now a first-class `finish` tool → `final` turn. Live-verified.

**The one genuine capability gap:** vision. v1's `VisionSensor` fed page screenshots
to a multimodal model; v2 is ARIA-first (R1: structured before pixels) and does not
send pixels to the model. ARIA snapshots are richer than screenshots for most
web/electron tasks (refs, roles, text), so this only matters for pixel-only content
(canvas, image maps, visual-only UIs). Closing it needs an artifact-bytes reader
wired into the agent context + a multimodal model — a deliberate, verifiable addition,
not yet built.

**Verdict:** functional + tool + backend parity reached (with intentional drops).
Blockers to deleting v1: (1) on-device GUI render verification; (2) decide vision —
build the pixels-to-model path or accept ARIA-first as the v2 stance.

### D35 — vision closed, agent verified, multi-platform (web + electron) confirmed

Follow-up to D34 after live verification against real Gemini + real targets.

- **Finish bug (critical):** the aisdk provider had no `finish` tool, so a real LLM
  could never terminate (it flailed to the turn ceiling). Added a first-class
  `finish` tool → `final` turn. Without this the agent was effectively non-functional
  on any real model. Live-verified.
- **Vision (D34's one gap) — closed.** The agent calls `browser.take_screenshot`;
  the aisdk provider resolves the screenshot bytes via an injected `ArtifactReader`
  (store-backed) and sends them as an image part. Agent-driven (sees pixels only when
  it looks) — a better fit for R1 than v1's always-on capture. Live-verified: the
  model described a page's background colour and layout, detail absent from the ARIA
  tree.
- **Multi-platform.** Web: fully live-verified (navigate → click by ref → observe →
  extract → finish, plus vision). Electron: `electron.test` launches the app, attaches
  over CDP, and drives its real DOM (in the 66-green suite); `run --electron <appPath>`
  makes it usable from the CLI; the agent loop assembles + invokes over an electron
  target. A fresh end-to-end electron+LLM completion is currently blocked only by the
  Google free-tier request quota (billing/rate, not code).

**Parity verdict:** all v1 capabilities now present in v2 (vision included);
intentional drops stand (workflows, budget vetoes). Remaining gate to delete v1 is
on-device GUI render verification (`npm run app`).

### D36 — F7 shipped, packaging shipped, GUI verified on the packaged app

Closes the last two open slices (6 Face, 9 Ship). Everything below was verified
against real artifacts, not stubs.

**F7 — the browser flips underneath a live session.** `TargetSession.setHeaded` is no
longer a stub. `PlaywrightBinding` (new, `providers/mcp/binding.ts`) owns a *replaceable*
browser process: a flip exports the live storage state to a file, closes the browser
(collecting its video/trace first), relaunches playwright-mcp in the other display mode
with `--storage-state`, and navigates back to the page the agent was on. A failed
relaunch restores the previous mode rather than leaving the run blind. Electron targets
refuse the flip — they already are a real window. `context.handoff` (R2) now flips
headed for the human and back afterwards, so a takeover shows the real logged-in page.

**Auth is a first-class, driver-neutral thing.** Contracts speak `authStateFile` /
`exportAuthState()`, not Playwright's "storageState" (the vocabulary stays inside the
driver). `case.captureAuth` drives a headed session and keeps the login once it settles
(cookies present and unchanged for 6s), writing `<workroot>/auth/<caseId>.json`;
`CaseContext.authStatePath` feeds `allocSession`, so later runs start signed in. An
empty browser is reported as `captured:false` — never faked.

**Packaging.** `npm run build:cli` (esbuild) emits a self-contained `dist/domia.mjs`
plus `dist/prompts/`; `npm run package:desktop` (electron-vite + electron-builder) emits
`Domia.app`/`.dmg`/NSIS/AppImage with prompts and playwright-mcp as unpacked resources.
Two packaging-only bugs surfaced and were fixed: prompts resolved from the user's cwd
(now from the install — `paths.ts`), and playwright-mcp was spawned as `node` from
inside an asar (now Electron-as-Node against the shipped copy — `runtime.ts`).
`DOMIA_DATA_DIR` / `DOMIA_PROMPTS_DIR` override; `.env` is also read from `~/.domia`.

**GUI run-verification (the D34/D35 gate).** The packaged app was driven *by Domia's
own electron target*: created a case in the UI, launched a run, and the live run view
showed the model's answer — which means the packaged app spawned playwright-mcp,
allocated a session and drove a browser from inside Electron.
`tests/integration/desktop.test.ts` keeps the deterministic half (shell renders, IPC
answers) and skips cleanly when no release build exists.

**Model chains reach the CLI.** `--model a:b,c:d` builds a `ModelSpec` chain (R7);
parsing lives in `@domia/agent` (`parseModelSpec`) so CLI/UI share one vocabulary.
Verified live: a bad model alone fails the run, the same bad model followed by a good
one succeeds mid-flight, and a chain whose first provider has no key degrades at alloc.

### D37 — consolidation, capture cost, and a free release path

**Consolidation.** The four point-in-time studies (computer-use landscape, MIL/OpenClaw
modularity, the slice 0–3 call-tree audit, the class-design audit) were deleted: their
conclusions live in DESIGN/PLAN/DECISIONS and the R-series, and git history keeps the
originals. The one
unreferenced export left in the tree — `serveStdio` — is now a real surface:
`domia mcp` serves Domia to any MCP host over stdio (E6/J10), logs already go to
stderr so the protocol channel stays clean. Tests share one `tmpDir()` helper.

**Capture is no longer free-by-default.** Every session used to start video *and*
Playwright-trace recording. Measured: ~1.0s of a ~1.7s session alloc, and video is the
dominant artifact on disk. Now `tools.record.video` (default **off**) and
`tools.record.trace` (default **on**) are config, still overridable per session via
`SessionOptions.record`; `bootHeadless({ values })` plumbs kernel config from a host,
which is how the loop test opts video back in to assert provenance. A one-turn CLI run
went 2.8s → ~2.0s with half the artifact bytes. `allocSession` is also traced now
(`tool.allocSession`) — session startup used to be invisible between spans.

**Bundles.** esbuild + electron-vite now minify: the CLI bundle is 2.5 MB → 1.3 MB.
The CLI tarball also ships the packages it *spawns* (`@playwright/mcp`, `playwright`,
`playwright-core`) under `dist/node_modules`, so an unpacked tarball drives a real
browser from any cwd — verified with `domia tools invoke` outside the repo.

**Free release path (no paid certificates, no paid services).** `mac.identity: null`
means unsigned builds; `INSTALL.md` documents the one-time Gatekeeper/SmartScreen
step per OS. Version is `2.0.0-beta.1` everywhere (root, desktop, `domia --version`),
the app has an icon and real metadata, and artifacts are named
`Domia-<version>-<os>-<arch>.<ext>`. Two GitHub Actions workflows: `check` (ubuntu,
`xvfb-run npm run check`, so the F7 headed-flip tests actually run in CI) and
`release` (tag `v*` → mac/win/linux matrix → CLI tarball + installers attached to the
GitHub release). Notarization, Windows signing and auto-update stay out until someone
pays for a certificate.

**Doctor now checks the thing that actually breaks on a fresh machine:** whether the
Chromium playwright-mcp drives is installed, with the command to fix it.

### D38 — auditing is a feature of the loop, not a second engine

First slice of the audit product. An audit is a normal run
with the `auditor` persona: the agent plans its own coverage and calls a belt —
`audit.dimensions | finding | coverage | score | report`. No audit pipeline exists in
code, which is the same non-negotiable as everywhere else.

`@domia/audit` owns only the vocabulary and the maths: twelve dimensions (performance,
accessibility, theme, language, states, seo, agentic, files, privacy, security, journey,
network), findings, evidence, scoring, report rendering. `EP.AuditService` lets the CLI,
API and UI read results without touching the loop.

Three rules are enforced in code, not in a prompt:
- **No finding without evidence.** `record` refuses a draft with neither artifact ids nor
  a verbatim `observed`; `observed` is persisted as a text artifact, so every finding
  points at something durable. Live-verified: a real model's first attempt was refused,
  and it immediately re-recorded the same finding with the 404 it had actually seen.
- **Confidence never blends.** `verified` (machine/direct observation), `probable` (model
  judgement) and `needs-human` carry different weights and are reported as three separate
  penalty totals. A model that labels its own opinion `verified` is the failure mode this
  product cannot survive.
- **Unassessed is not a pass.** A dimension with no declared coverage has *no* score, in
  the CLI table, the report and the roll-up.

Scores are deterministic: `100 · exp(−Σ(severity × confidence × reach) / k)`, with a
verified blocker capping its dimension at 49. `k` is a calibration constant per
dimension; the golden corpus that calibrates it is A6 work, so today's numbers are
comparable across runs, not against an industry benchmark.

Storage is per-run and in memory in this slice. Persisting findings and diffing against a
baseline lands after the store gets schema migrations — the audit tables are precisely
the data a user cannot afford to lose, so that prerequisite is now on the critical path.

### D39 — the deterministic pass earns its keep before the model is allowed to think

`audit.sweep` (A1) fetches an origin's expected files, its response headers and its
served HTML, then decides in pure functions: `checks/{files,security,page}.ts` over a
`SweepContext`. Fifteen verified findings on a real site in ~200 ms, no model, no
browser. The auditor persona now runs it first, so judgement is only spent where the
cheap tier left a question — the cost discipline from AUDIT-DESIGN §2, enforced by the
belt rather than by hope.

`domia audit <url> --sweep-only` runs it with no model at all (and `--json` for
scripting), which also makes the product demonstrable without an API key. Findings,
coverage and the rendered report all flow through the same `AuditService`, so the
deterministic pass and the agent pass produce one artifact, not two formats.

**Auditing a real site immediately produced two false positives, and both are now
regression tests.** `Server: AmazonS3` was reported as a version banner because the
check looked for any digit; it now requires a version-shaped `\d+\.\d+`. A 456-byte
document was reported as uncompressed; compression is only worth a finding above one
network packet. A false positive costs more than a missed finding here — the deliverable
is trust — so the fixture suite tests a *clean* origin and asserts the sweep reports
exactly one thing (that the fixture is plain http) and nothing else.

Test shape: two real HTTP servers, no mocks. One does everything right (full headers,
gzip, complete head, all the well-known files), one does nothing (SPA shell, no files, no
headers). Plus a run through the belt itself, asserting the agent's `audit.sweep` call
records evidence-carrying findings and leaves untouched dimensions unassessed.

Also new: `seo.client-rendered`. An empty `<div id="root">` shell is reported once as the
root cause, above the missing title/description/heading it explains — the fix-pack idea
from the design, in its simplest form.

### D40 — audits scale by template, and the app shows them

**Scale.** A sweep no longer means "the home page". `discover.ts` finds what a site
publishes — sitemap (following a sitemap index) when there is one, the home page's own
links when there is not — honours `Disallow` for `*`, skips assets, and caps the crawl.
`cluster.ts` gives each document a signature from its path shape (`/blog/:n/:slug`) and a
bucketed structural tag census, so pages that share a template land together.
`rollup.ts` then emits **one finding per (check, template)** carrying a reach, instead of
one per URL. A 100k-page site has a handful of templates: audit two of each, say "12 of
12 sampled pages", and the score already weighs reach. Fetches are pooled, four at a
time; `maxPages` is a hard cap so an audit always finishes.

**The app shows it.** `audits.sweep | list | get` on the api facade, the same three
paths on the IPC router, and an Audits view in the desktop app: a card per assessed
dimension (score, grade, meter, coverage, severity counts, the verified/judged/needs-human
split, and what the dimension did *not* cover), an explicit "not assessed" line, then
findings grouped by severity with the fix, the verification, the starter snippet and the
evidence behind a disclosure. Verified on the packaged build by driving it through
Domia's own electron target: typed a URL, clicked Run sweep, and read the rendered result
back out of the accessibility tree.

**Persistence without migrations.** `report()` now also writes a JSON snapshot artifact
next to the markdown, and `AuditService.load` rehydrates from it, so an audit recorded by
an earlier process still opens in the UI. Real tables still wait on schema migrations —
this is the honest interim, not a substitute.

**CLI.** Findings print one line per check with `(N template(s), affected/sampled pages)`
rather than repeating a row per URL, so a multi-template site reads as a summary.
