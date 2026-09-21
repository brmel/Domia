# DOMIA V2 — Implementation Plan

> The build map: every package, every class, its interface, its file. Companion
> to [DESIGN.md](./DESIGN.md) (architecture + rationale), [MODULES.md](./MODULES.md)
> (full API signatures), [ECOSYSTEM.md](./ECOSYSTEM.md) (what we adopt: MCP,
> playwright-mcp, AI SDK, Agent Skills), [JOURNEYS.md](./JOURNEYS.md) (validated
> user journeys), the R-series improvements below (adopted
> improvements R1–R9). **No code exists yet — this document is the contract for
> writing it.**

---

## 0. Ground rules (carry-over, non-negotiable)

- **Maximally agentic**: no hardcoded steps/stages/plans. One loop + meta-tool
  belt. Behavior in `prompts/personas/*.md`, never TypeScript.
- Informants, not vetoes. User cancel = only hard stop. Verdict-less `final` legit.
- Module kinds: **K1** service (stateless fns) · **K2** factory
  (`alloc → Context → execute → Outcome → dispose`) · **K3** provider (extension
  point impl). Micro-contexts: `Span`, `Transaction`.
- Modules import only `@domia/contracts` + `@domia/kernel`; cross-module =
  `host.resolve(extensionPoint)`.
- `Result<T,E>` (neverthrow) at every boundary; Zod at every wire/row edge; no
  mocks — conformance kits + replay + real targets.
- **Conventions (D14/D15, learned building slice 0):** import Result/Outcome
  helpers from `@domia/contracts` (never `neverthrow` directly); build optional
  fields with `...(v !== undefined ? { k: v } : {})` (exactOptionalPropertyTypes);
  logs → stderr, command output → stdout.

## 1. Package map (13 modules + hosts) — single-host

**Adopt-not-build (ECOSYSTEM.md):** browser automation = **microsoft/playwright-mcp**
mounted via `McpToolProvider` (E2); LLM providers = **Vercel AI SDK**, one adapter
for 25+ (E3); external tools = **any MCP server** a case mounts (E1); skills =
**Agent Skills SKILL.md** open standard (E4); Domia is also exposed **as** an MCP
server, `packages/domia-mcp` (E6). Net: fewer classes to write, the ecosystem's
5,800+ servers become case config.

```
packages/
  contracts    kernel      trace       store
  tools        agent       case        plan
  memory(R3)   loop        api
  ui           cli
  hosts/desktop   hosts/headless
  domia-mcp(E6)   conformance
prompts/personas/*.md        lead · explorer · verifier · reporter
prompts/skills/<name>/SKILL.md   (R4)
```

Dependency layers unchanged (DESIGN §5): ground (contracts, kernel) → infra
(store, trace) → domain (tools, agent, case, plan, memory) → loop → api → surfaces.

---

## 2. Per-package class plan

Format: interface-at-a-glance (full signatures in MODULES.md) then **class
table** — concrete classes/files to write. `≈n` = target line budget.

### 2.1 `@domia/contracts` — K0, types only

No classes. One file per module interface + Zod schemas.

| File | Contents |
|---|---|
| `ids.ts` | branded ids (`RunId`, `CaseId`, `PlanId`, `ItemId`, `PersonaId`, `CallId`, `ArtifactId`, `TraceId`, `SpanId`, `SecretRef`, `PromptRef`, `MemoryId` R3) |
| `errors.ts` | `DomiaError`, `ErrorCode` typed-const catalog, `ModuleResult<T>` |
| `module.ts` `context.ts` `outcome.ts` | `DomiaModule`, `ModuleHost`, `Context`, `ContextFactory`, `Outcome`, `OutcomeMeta`, `TokenUsage` |
| `events.ts` | `DomiaEventMap` (module.loaded, run.started/turn/call/plan.changed/waiting_user/signal/spawned/terminal, artifact.saved, schedule.fired R5) |
| `tools.ts` `agent.ts` `case.ts` `plan.ts` `memory.ts` `loop.ts` `trace.ts` `store.ts` `api.ts` | each module's public interface types |
| `schemas/*.schema.ts` | Zod for every wire/row type |
| `index.ts` | explicit re-exports |

### 2.2 `@domia/kernel` — root context

```ts
createKernel(cfg) → Kernel { load(modules), resolve, resolveAll, events, shutdown }
```

| Class | File | Role |
|---|---|---|
| `KernelImpl` | `kernel.ts` | load (topo order) / resolve / shutdown ≈150 |
| `ExtensionRegistry` | `registry.ts` | `Map<string, unknown[]>` keyed by `point.id`; arity-checked (`'one'` double-register → `EXTENSION_CONFLICT`, D3) |
| `topoSort()` | `topo.ts` | pure fn, cycle detection |
| `TypedEventBus` | `eventBus.ts` | mitt-backed emit/on + `BoundedStream` (drop-oldest AsyncIterable) |
| `ScopedConfig` / `ScopedLogger` | `config.ts` `logger.ts` | per-module views (cosmiconfig + pino) |
| `TracingMiddleware` | `middleware.ts` | wraps registered factories: span per alloc/dispose |
| `ContextTracker` | `contextTracker.ts` | live-context set; leak report + force-dispose at shutdown |

### 2.3 `@domia/trace` — K1 + `Span` micro-context + K3 sinks

```ts
Tracer { span, event, saveArtifact, openArtifact }   Span { child, setAttrs, addCost, end }
TraceSink { write, flush }    TraceQuery { runTree, agentExchanges, timeline }
```

| Class | File | Role |
|---|---|---|
| `TraceModule` | `module.ts` | registers tracer + sinks + query |
| `TracerImpl` / `SpanImpl` | `tracer.ts` `span.ts` | ring-buffered records; cost roll-up |
| `RingBuffer` | `ring.ts` | non-blocking hot path; sinks drain async |
| `RedactionFilter` | `redact.ts` | secrets never leave the process |
| `ArtifactStore` | `artifacts.ts` | `artifacts/<sha2>/<sha256>`, hash-dedupe, streams |
| `JsonlSink` / `StoreSink` / `OtlpSink` | `sinks/*.ts` | per-run trace.jsonl / rows via store / env-gated OTLP |
| `TraceQueryImpl` | `query.ts` | replay source (`agentExchanges`) + UI timeline |

### 2.4 `@domia/store` — K1 repos + `Transaction` micro-context

```ts
Store { cases, runs, plans, exchanges, traces, artifacts, snapshots, settings, schedules(R5), memories(R3), migrate, tx }
```

| Class | File | Role |
|---|---|---|
| `StoreModule` | `module.ts` | opens db, migrate, registers repos |
| `Database` | `db.ts` | better-sqlite3 behind async facade; WAL; FK on |
| `WriteQueue` | `writeQueue.ts` | single-writer serialization |
| `TxRunner` | `tx.ts` | `tx(fn)` rollback on err-Result/throw |
| `schema.ts` | | one baseline DDL: cases, runs, plans, plan_items, plan_revisions, exchanges, trace_spans, trace_events, artifacts, snapshots, settings, **schedules** (R5), **memories** (R3) |
| `CaseRepo` `RunRepo` `PlanRepo` `ExchangeRepo` `TraceRepo` `ArtifactIndexRepo` `SnapshotRepo` `SettingsRepo` `ScheduleRepo` `MemoryRepo` | `repos/*.ts` | boring CRUD + narrow queries, Zod-validated both directions |

### 2.5 `@domia/tools` — K2 (`TargetSession`) + K3 providers

```ts
ToolService { providers, catalog, allocSession }        // target lock F3; headed/interactive F2
TargetSession { manifests, invoke, observe, handoff(R2), setHeaded(F7), configure/inspect/dispose }
ToolProvider { supports, manifests, attach }            // K3
```

| Class | File | Role |
|---|---|---|
| `ToolsModule` / `ToolServiceImpl` | `module.ts` `service.ts` | provider registry, capability gating, **case tool policy** (R6) |
| `TargetSessionImpl` | `session.ts` | the one invoke/observe path; `handoff()` → headed human control, resume on confirm (R2) |
| `InvokePipeline` | `middleware.ts` | validate → span → informants → execute → capture → record |
| `TargetLocks` | `locks.ts` | attach-targets exclusive (`TARGET_BUSY`) |
| `ManifestGate` | `manifest.ts` | capabilities ∩ case policy (R6) ∩ persona toolset |
| **mcp** (E1/E2): `McpToolProvider`, `McpServerManager` (kernel-tracked, restart policy F8), `TargetLauncher` (electron `--remote-debugging-port` → playwright-mcp `--cdp-endpoint`), `SchemaMapper` (JSON Schema → Zod) | `providers/mcp/` | **default browser = microsoft/playwright-mcp** (ARIA `ref=eN`, `--storage-state`); + any case-mounted MCP server |
| **capture**: `CaptureProvider`, `VideoRecorder` | `providers/capture/` | screenshot/video → artifacts |
| *parked* `PlaywrightDirectProvider` | `providers/playwright/` | build only if playwright-mcp blocks a real need (E2) |
| **os-a11y** (R1): `OsA11yProvider` (macOS AX API first) | `providers/os-a11y/` | desktop targets read structured tree — before any pixel path |
| **vision** (R1): `VisionLocator` — `vision.locate {description} → ref/coords` via set-of-marks screenshot | `providers/vision/` | grounding ladder rung 2; hostile/DOM-less UIs |
| **native-input**: `NativeInputProvider` | `providers/native-input/` | coordinates — last rung |
| **shell**: `ShellProvider`, `ShellSandbox` | `providers/shell/` | cwd-rooted, output-capped, risk `dangerous` |
| **files**: `FilesProvider` | `providers/files/` | rooted at `caseCtx.workdir` |
| **skills** (R4): `SkillLibrary` (SKILL.md discovery, selective offering), `SkillRecorder` (mint from invoke middleware), `SkillPlayer` | `providers/skills/` | skills as markdown folders; recording replay as composite tool |

### 2.6 `@domia/agent` — K2 (`AgentContext`) + K3 providers

```ts
AgentService { providers, models, alloc }               // failover chain R7
AgentContext { step, stream, fork, snapshot, restore, configure/inspect/dispose }
AgentTurn = act | ask | final(verdict?)                  // propose-only, terminal is a turn
```

| Class | File | Role |
|---|---|---|
| `AgentModule` / `AgentServiceImpl` | `module.ts` `service.ts` | provider routing + **FailoverChain** (R7: ordered models, switch on auth/quota/5xx only) |
| `ConversationLog` | `conversation.ts` | provider-neutral message log; manifest→schema mapping |
| `ToolSchemaMapper` | `map.ts` | ToolManifest ⇄ provider tool format |
| `RetryPolicy` | `retry.ts` | provider-neutral network retry (transport errors only) |
| `SnapshotCodec` | `snapshot.ts` | suspend/resume conversation blobs |
| `AiSdkProvider` (E3 — Vercel AI SDK, 25+ model providers incl. Gemini/ADC, Claude, OpenAI-compat, Ollama) · `ReplayProvider` | `providers/aisdk/provider.ts` · `providers/replay/provider.ts` | tools-without-execute → propose-only; `ReplayProvider` ≈100 lines over `trace.agentExchanges`. Replaces 4 hand-written adapters |
| `ModelRegistry` · `FailoverChain` (R7) | `modelRegistry.ts` `failover.ts` | ordered models per persona; switch on auth/quota/5xx/malformed-tool only |
| `SdkLoopBridge` | `providers/aisdk/bridge.ts` | for SDKs that insist on executing tools: stubs park → surface `act` → resume |

### 2.7 `@domia/case` — K1 CRUD + K2 (`CaseContext`)

```ts
CaseService { create/get/list/update/archive, validate, captureAuth(F2), allocContext }
CaseContext { resolvedTarget, workdir, secret(ref), toolPolicy(R6) }
```

| Class | File | Role |
|---|---|---|
| `CaseModule` / `CaseServiceImpl` | `module.ts` `service.ts` | CRUD via store; Zod drafts |
| `CaseContextImpl` | `context.ts` | secrets resolved in memory only |
| `SecretVault` | `secrets.ts` | OS keychain, else age-encrypted file |
| `AuthCapture` | `authCapture.ts` | headed session → user logs in → storageState encrypted |
| `CaseValidator` | `validate.ts` | reachability/auth/secret checks (advisory Outcome) |
| `WorkdirManager` | `workdir.ts` | `~/.domia/work/<runId>/`, retention policy |

### 2.8 `@domia/plan` — K2 (`PlanContext`)

```ts
PlanService { allocContext, query.get/history }
PlanContext { current, apply, toolManifests, dispatch, onChange, staleness, dispose }
plan.* = propose · add_item · start_item · complete_item · drop_item · revise · note
```

| Class | File | Role |
|---|---|---|
| `PlanModule` / `PlanServiceImpl` | `module.ts` `service.ts` | alloc + queries |
| `PlanContextImpl` | `context.ts` | write-through revisions; emits before returning |
| `PlanStateMachine` | `ops.ts` | pure op→transition validation |
| `PlanToolBelt` | `tools.ts` | `plan.*` manifests + dispatch |
| `StalenessInformant` | `staleness.ts` | signal, never a stop |

### 2.9 `@domia/memory` — NEW (R3), K1 service + belt

```ts
MemoryService { relevant(caseId, request) → MemoryCard[],  toolManifests, dispatch }
memory.* = save {text, tags} · recall {query} · list
```

| Class | File | Role |
|---|---|---|
| `MemoryModule` / `MemoryServiceImpl` | `module.ts` `service.ts` | per-case markdown memories (rows index + md bodies) |
| `MemoryStore` | `files.ts` | `~/.domia/memory/<caseId>/*.md` + `MemoryRepo` index |
| `MemoryToolBelt` | `tools.ts` | `memory.*` manifests + dispatch |
| `RelevanceSelector` | `select.ts` | **selective injection** at run start (tags + request match — OpenClaw lesson: never balloon the prompt) |

### 2.10 `@domia/loop` — K2 (`LoopRun`) + K3 meta-tools — the harness

```ts
LoopEngine { registerMetaTool, personas, alloc(binding) }
LoopRun { start, pause/resume/cancel, answer, events, configure/inspect/dispose }
MetaToolHandler { manifests(runView), dispatch(call, internals) }               // K3
belt: plan.* · memory.* · user.ask · user.takeover(R2) · agent.spawn/await ·
      context.handoff · skill.* · suspend
```

| Class | File | Role |
|---|---|---|
| `LoopModule` / `LoopEngineImpl` | `module.ts` `engine.ts` | belt assembly, persona resolution, run alloc |
| `LoopRunImpl` | `run.ts` | lifecycle, lazy session/plan/memory alloc, RunReport assembly |
| `runLoop()` | `loop.ts` | **THE file** ≈150: observe → step → route → signals → repeat |
| `ToolRouter` | `router.ts` | prefix table → session / plan / memory / meta; unknown = failed Outcome |
| `Gate` | `gate.ts` | pause/cancel/answer/approvals — between turns AND between calls |
| `InformantHub` + `BudgetInformant` `DurationInformant` `ContextPressureInformant` `IdleInformant` (F6) | `informants.ts` | one collection point; signals only |
| `PersonaRegistry` | `personas.ts` | `prompts/personas/*.md` + settings overrides (lead/explorer/verifier/reporter) |
| `AskHandler` `TakeoverHandler`(R2) `SpawnHandler` `AwaitHandler` `HandoffHandler` `SkillsHandler` `SuspendHandler` | `meta/*.ts` | ≈40 lines each |
| `RunReportAssembler` | `report.ts` | final turn + plan snapshot + stats |

### 2.11 `@domia/api` — K1 facade + `RunRegistry`

```ts
DomiaApi { cases, runs, plans, traces, tools, agents, memories, schedules(R5), settings }
runs.start(caseId, request, opts?: RunOptions) — raw request, no modes
runs.watch → sync snapshot first (F5), then live
```

| Class | File | Role |
|---|---|---|
| `ApiModule` / `DomiaApiImpl` | `module.ts` `api.ts` | validate → delegate → shape |
| `RunRegistry` | `runRegistry.ts` | `Map<RunId, LoopRun>` (F1), evict on terminal/suspend |
| `CasesApi` `RunsApi` `PlansApi` `TracesApi` `ToolsApi` `AgentsApi` `MemoriesApi` `SchedulesApi` `SettingsApi` | `namespaces/*.ts` | thin |
| `Scheduler` (R5) | `scheduler.ts` | cron ticker → `runs.start`; heartbeat = standing schedule |
| `ReadModels` / `unwrap()` | `readModels.ts` `unwrap.ts` | wire-safe projections, no stacks/secrets |

### 2.12 `@domia/ui` — consumer

Feature slices: `cases/` (editor, validation), `runs/` (launcher, **live run
view**: activity lane + plan board + question/approval/takeover cards + cost
meter), `trace/` (timeline, filmstrip via `domia-artifact://`), `memory/`
(browse/edit cards), `schedules/` (cron list), `settings/` (personas, providers,
keys). TanStack Query + per-run zustand slices. Built at slice 6.

### 2.13 `@domia/cli` — consumer

`commands/`: run (+`answer` prompt on waiting_user), case (add/auth/validate),
plan, trace, tools, agent, memory, schedule, doctor, settings.
`render/`: lane, planBoard, table, json. In-process boot; `--daemon <url>` for WS.

### 2.14 Hosts

| Class | File | Role |
|---|---|---|
| `bootHeadless()` | `headless/main.ts` | kernel + all modules + plugins |
| `WsGateway` (R8) | `headless/ws.ts` | typed WS: schema-validated frames, request/response + server-push, pairing; loopback-only default. SSE fallback `sse.ts` |
| `bootDesktop()` `MainWindow` `IpcBridge` `ArtifactProtocol` (F4) | `desktop/*.ts` | Electron shell, V1 security posture |

### 2.15 `@domia/conformance`

`toolProviderKit` · `agentProviderKit` (propose-only, snapshot round-trip) ·
`metaToolKit` · `traceSinkKit`. Executable specs any provider must pass.

### 2.16 `@domia/domia-mcp` — Domia AS an MCP server (E6)

Thin MCP server over the api facade so any MCP host (Claude Code, Codex CLI,
another Domia) can drive Domia as a tool (J10). Symmetric to `McpToolProvider`
which *consumes* MCP.

| Class | File | Role |
|---|---|---|
| `DomiaMcpServer` | `server.ts` | MCP TypeScript SDK server; stdio + HTTP |
| tool defs | `tools.ts` | `domia_run_start` (returns runId, never blocks), `domia_run_status`, `domia_case_list`, `domia_trace_timeline` |
| `ApiBridge` | `bridge.ts` | calls `DomiaApi` in-process or over WS (R8) |

---

## 3. Build order (tracer bullets — each slice demo-able)

| Slice | Build | Demo gate |
|---|---|---|
| **0 Ground** ✅ | contracts, kernel, trace(jsonl), hosts boot, cli doctor | **DONE** — `domia doctor` green; span+event in trace.jsonl; tsc+check-modules clean. Found+fixed D13/D14/D16 |
| **1 Hands** ✅ | tools: `McpToolProvider` + playwright-mcp; `TargetSession` invoke/observe with span tracing | **DONE** — `domia tools invoke <url> --steps click:eN` observes inline ARIA refs + clicks + follows nav; spans in trace.jsonl. Found+fixed D17/D18. (capture, locks, kernel middleware → next) |
| **2 Brain** ✅ | agent: `AiSdkProvider` (Gemini/Claude) + replay; propose-only via no-execute tools | **DONE** — `domia agent smoke` runs act→toolResults→final against real Gemini. Found+fixed D19 (name map), D20 (system option) |
| **3 Pulse** ✅ | loop: runLoop, router, gate, informants; persona `lead` | **DONE** — autonomous run + replay e2e green; plan_stale informant (D28); replay from tape (D29) |
| **4 Memory(rows)** ✅ | store (all repos) + case (+captureAuth) | **DONE** — runs/plan/tape/artifacts persisted; suspend/resume |
| **5 Mind** ✅ | plan + belt (`user.ask`, spawn/await, handoff, suspend) + personas | **DONE** — belt complete: spawn/await (D27), context.handoff (D31), suspend, user.ask |
| **6 Face** ✅ | api (RunRegistry, watch-sync) + desktop host + ui live view | **DONE** (D30/D32/D36) — cases/live-runs/trace/settings/skills/memory views; GUI run-verification done on the *packaged* app (case created in the UI, run launched, answer shown in the live run view), kept as `tests/integration/desktop.test.ts` |
| **7 Reach** ✅ | failover (R7, config); MCP mounts (E1); shell/files; skills SKILL.md (R4); memory module (R3); plugins; **multi-scraper drivers (D26)** | **DONE** — MCP mounts, shell/files, skills, memory, plugins; fetch/firecrawl/crawl4ai scrapers |
| **8 Senses** ◐ | os-a11y (R1), vision.locate (R1), native-input, takeover (R2) | **takeover DONE** — belt-tool handoff + degrade (D31) *and* the physical headed flip (F7, D36); vision closed (D35). Per D33, os-a11y/native-input are **not** v1 features → v2-future, not parity blockers |
| **9 Ship** ✅ | scheduler (R5), tool policy (R6/F11), `domia-mcp` outbound (E6), desktop+headless packaging, conformance kits | **DONE** — scheduler/policy/domia-mcp/conformance (D30/D31); `setHeaded` browser-flip + `npm run build:cli` (self-contained `dist/domia.mjs`) + `npm run package:desktop` (app/dmg/nsis/AppImage) (D36) |

Every slice: `tsc --noEmit` clean · `check-modules` (D1–D7, god-file, internal-privacy) clean · e2e green · demo command in the PR. **Single-host throughout** — the product is complete at slice 9. Distribution is deferred (DESIGN §17): not a slice, no code; the `invoke`/`observe` seam keeps it a later host-only addition.

## 4. Definition of done (per class)

1. Interface matches MODULES.md (or MODULES.md updated first — docs lead code).
2. Sync/async per doctrine (MODULES §2.2). K2 contexts kernel-tracked.
3. Every execute traced; secrets redacted; errors are `DomiaError`s.
4. Conformance kit or module e2e covers it (real kernel, no mocks).
5. ≤300 lines/file; one concern; no comments that restate code.
