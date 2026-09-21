# DOMIA V2 — Design Document

> A ground-up modular redesign. Every module is a box with an allocatable **Context**,
> an **Execute** operation, and a queryable **Result** — the Matrox Imaging Library
> (MIL) discipline applied to an LLM-driven automation platform.
>
> Full per-module API reference (functions, contexts vs results, sync vs async):
> **[MODULES.md](./MODULES.md)**.

---

## Table of contents

1. [Why V2 — the V1 autopsy](#1-why-v2--the-v1-autopsy)
2. [Design philosophy — the MIL model](#2-design-philosophy--the-mil-model)
3. [The uniform lifecycle — why, and where it honestly fits](#3-the-uniform-lifecycle--why-and-where-it-honestly-fits)
4. [Maximally agentic — the research and the decision](#4-maximally-agentic--the-research-and-the-decision)
5. [Module map and dependency rules](#5-module-map-and-dependency-rules)
6. [The module boxes](#6-the-module-boxes)
7. [How the modules connect](#7-how-the-modules-connect)
8. [User journeys — data flow and validation](#8-user-journeys--data-flow-and-validation)
9. [The extension model — plugins everywhere](#9-the-extension-model--plugins-everywhere)
10. [Doing Playwright right](#10-doing-playwright-right)
11. [Data model](#11-data-model)
12. [Repository layout](#12-repository-layout)
13. [What we keep from V1, what we drop](#13-what-we-keep-from-v1-what-we-drop)
14. [Implementation roadmap](#14-implementation-roadmap)
15. [Testing strategy](#15-testing-strategy)
16. [Open decisions](#16-open-decisions)
17. [Single-host now — the seam kept open for later](#17-single-host-now--the-seam-kept-open-for-later)

Companion documents: **[JOURNEYS.md](./JOURNEYS.md)** (every user journey with
failure/recovery paths), **[ECOSYSTEM.md](./ECOSYSTEM.md)** (MCP, playwright-mcp,
AI SDK, Agent Skills — what we adopt and why), **[PLAN.md](./PLAN.md)** (per-class
build map + the adopted R-series improvements), **[packages/DECISIONS.md](./packages/DECISIONS.md)**
(every design fix, D1 onwards).

---

## 1. Why V2 — the V1 autopsy

V1 ended up with a respectable hexagonal architecture (pure domain, ports/adapters,
DI, `Result<T,E>`, e2e-only tests) — but the *shape* of the system fought us:

| # | Symptom in V1 | Root cause |
|---|--------------|-----------|
| A | `backend/runs/` grew to **20 sibling services** around one loop | No pipeline concept. Every cross-cutting concern became a peer service wired by DI instead of middleware on one execution path. |
| B | `ToolDependencies` became a **17-field grab-bag** | Tools had no session abstraction. Every new capability punched a new hole through one god-context. |
| C | Tool execution happened **inside** the ADK runtime | The LLM SDK owned the agent↔tool loop. Tracing, policy, recording, replay each re-hooked into the SDK instead of one mediated dispatch path. |
| D | **No Case entity** — runs carried raw goals + platform flags | Targets and goals conflated with executions. |
| E | **User-authored workflow steps** — a whole second machinery (`backend/workflows/`, 8 services) for humans to hand-write step lists | Wrong ownership. Decomposing a goal into steps is the agent's job; hand-written steps go stale, duplicate the agent's competence, and forked the execution model in two (slice 19 never managed to reunify them). |
| F | Layer-first folders smeared **one feature across five directories** | Organization by technical layer, not by module. |
| G | Playwright leaked through **four port families** (`IAppDriver`, `IStructuredAutomation`, `ITabManager`, `IWindowManager`, sensors) | No single owner of "the target session". |
| H | Plugins and skills were **bolted on** | Extensibility an afterthought; built-ins used a privileged path. |

**V2 answer in one sentence:** organize by *module* (not layer), give every module
the *same* narrow API shape (context/execute/result), let the **agent** own task
decomposition through a living plan (no user-authored steps, lesson E), make the
**loop** the only place agent and tools meet, and make "provider plugin" the
native shape of everything.

---

## 2. Design philosophy — the MIL model

The Matrox Imaging Library survives decades of hardware and algorithm churn because
every module — image processing, blob analysis, model finder, OCR, 3D — obeys one
uniform discipline:

```
MappAlloc            → application context (one per process)
MsysAlloc            → system context (a device/target binding)
MbufAlloc            → buffers (data with metadata)
M<mod>Alloc          → module context   (configuration handle)
M<mod>Control        → set a parameter on a context
M<mod>Inquire        → read a parameter back
M<mod>AllocResult    → result object (queryable container)
M<mod>Find/Execute   → execute(context, source, result)
M<mod>GetResult      → extract typed values from the result
MxxxFree             → deterministic teardown
```

Why it works:

- **Uniformity** — learn one module, you know them all.
- **Contexts are values** — configuration is explicit state you allocate, mutate,
  inspect, and free; never global. Alloc once, execute many times.
- **Results are first-class** — execution never returns scattered data; it fills a
  self-describing result you query, serialize, and store.
- **Modules never call each other** — they share only application/system contexts
  and buffers. Composition happens in *your* code, not inside the library.
- **Hardware/algorithm swap is invisible** — the context hides which grabber or
  matcher is behind it.

### The Domia V2 translation

| MIL concept | DOMIA V2 equivalent |
|---|---|
| `MappAlloc` (application) | **Kernel** — one per process; registry, events, config, logging |
| `MsysAlloc` (system/device) | **TargetSession** — a bound target (browser page, Electron app, OS desktop) |
| `MdigAlloc` (digitizer) | **Capture provider** — screenshot / video / accessibility snapshot |
| `MbufAlloc` (buffer) | **Artifact** — content-addressed blob + metadata, owned by Trace |
| `M<mod>Alloc` context | `module.alloc(config) → Context` (AgentContext, TargetSession, PlanContext, LoopRun, CaseContext) |
| `M<mod>Control` / `Inquire` | `ctx.configure(patch)` / `ctx.inspect()` — synchronous |
| `M<mod>AllocResult` + `GetResult` | `Outcome<T>` envelope — typed value + status + meta (timing, cost, artifact refs), serializable |
| `M<mod>Free` | `ctx.dispose()` — deterministic, idempotent |
| MIL async grab + hook functions | `AsyncIterable` event streams + `EventBus` subscriptions |
| MIL error stack (`MappGetError`) | `DomiaError` catalog in contracts + `neverthrow` `Result` at every boundary |

Two deliberate deviations for a GC'd language:

1. Results are **returned**, not pre-allocated — but they keep the MIL property of
   being self-describing, queryable envelopes.
2. Parameters are **typed config objects**, not stringly `Control(id, value)` pairs —
   `configure`/`inspect` keep the mutable-context semantics with compile-time safety.

**The DMIL corollary (informs §17).** Because every seam is an allocated handle
with a uniform API, a seam *could* later become a network seam without changing
callers — the Distributed-MIL property. DOMIA runs single-host today (§17); we
keep this property as insurance, not as a feature (§17).

---

## 3. The uniform lifecycle — why, and where it honestly fits

### 3.1 Why `alloc → Context`, `execute → Outcome`, `dispose` at all

Because every hard problem in this system is a *lifetime* problem or a *provenance*
problem:

| Force | What the lifecycle buys |
|---|---|
| Live resources (browsers, Electron apps, LLM conversations, runs) leak or zombie when ownership is fuzzy | `alloc`/`dispose` pairs make ownership explicit; the kernel tracks live contexts and force-disposes leaks at shutdown — zombie browsers become impossible by construction |
| Config drifts mid-run (model, temperature, timeouts) | config is context state — `configure` is sync, validated, effective next execute; no global settings reads inside loops |
| Everything must be traceable and replayable | executes are the only state-changing verbs, so wrapping them (kernel middleware) traces the whole system; `Outcome.toJSON()` is the persistence/replay unit |
| Providers must be swappable (LLM libs, automation libs) | the context hides *which* provider is behind it — the same reason MIL survives hardware churn |
| Twelve modules, one team | learn-one-know-all: one mental model for the runtime modules instead of five bespoke APIs |

### 3.2 Does it fit every module? Honest per-module analysis

**No — and forcing it where there is no live resource would be ceremony.** The
analysis, module by module:

| Module | Owns live state? | Full triad fits? | Verdict |
|---|---|---|---|
| tools | browser / app session | **yes** | canonical — `TargetSession` |
| agent | a conversation | **yes** | canonical — `AgentContext` |
| plan | the living plan | **yes** | `PlanContext` |
| loop | a run | **yes** | `LoopRun` (long-running execute) |
| case | resolved secrets + workdir | **yes** for `CaseContext`; the CRUD side is stateless | hybrid: service + factory |
| trace | span timing only | micro | `Span` is a micro-context (`span()`→`end()`, no configure); `Tracer`/`TraceQuery` are plain services |
| store | transaction scope only | micro | `Transaction` is a micro-context; repos are plain services — session objects on repos would add nothing |
| kernel | the process | it **is** the root context | `createKernel → load → shutdown` ≈ alloc/execute/dispose of the app itself |
| api | nothing (delegates) | no | service facade — with one deliberate exception: `RunRegistry` *holds* live `LoopRun` handles so surfaces can reach them |
| contracts | nothing | n/a | types only — exempt |
| ui / cli / hosts | render / compose | n/a | consumers and composition roots — exempt |

### 3.3 Module kinds — common where real, not forced

Three kinds; the only interface **all** of them share is the loadable-module base:

```ts
// K0 — every loadable module shares ONLY this
export interface DomiaModule {
  readonly manifest: ModuleManifest;
  init(host: ModuleHost): Promise<ModuleResult<void>>;
  dispose(): Promise<void>;
}

// K1 — SERVICE module: stateless async operations, no contexts
//      (store repos, trace tracer/query, case CRUD, api namespaces)
//      shape: interface XService { fn(args): Promise<ModuleResult<T>> }

// K2 — FACTORY module: the full MIL triad
export interface Allocates<TConfig, TCtx extends Context<TConfig, any>> {
  alloc(config: TConfig): Promise<ModuleResult<TCtx>>;
}
//      tools → TargetSession · agent → AgentContext · case → CaseContext
//      plan → PlanContext    · loop → LoopRun

// K3 — PROVIDER: an implementation registered at an extension point,
//      consumed BY a K1/K2 module, never called directly by anyone else
//      (tool providers, agent providers, meta-tool handlers, trace sinks)
```

Per-module interface map (full detail per module in [MODULES.md](./MODULES.md)):

| Module | Kind(s) | Interface(s) | Context(s) | Result(s) |
|---|---|---|---|---|
| contracts | types | — | — | — |
| kernel | root context | `Kernel` | itself | — |
| trace | K1 + micro | `Tracer`, `TraceQuery`; `TraceSink` (K3) | `Span` (micro) | `SpanTree`, `ArtifactRef`, exchanges |
| store | K1 + micro | `Store` (repos) | `Transaction` (micro) | rows, `Page<T>` |
| tools | K2 + K3 | `ToolService`; `ToolProvider` (K3) | `TargetSession` | `Outcome<ToolOutput>`, `Outcome<Observation>` |
| agent | K2 + K3 | `AgentService`; `AgentProvider` (K3) | `AgentContext` | `Outcome<AgentTurn>`, `ConversationSnapshot` |
| case | K1 + K2 | `CaseService` | `CaseContext` | `Case`, `Outcome<CaseValidation>` |
| plan | K2 | `PlanService` | `PlanContext` | `Plan`, `PlanRevision` |
| loop | K2 + K3 | `LoopEngine`; `MetaToolHandler` (K3) | `LoopRun` | `Outcome<RunReport>` |
| api | K1 (+ registry) | `DomiaApi` | — (`RunRegistry` holds K2 handles) | `ApiResult<T>`, event streams |
| ui / cli | consumer | — | — | — |
| hosts | composition | `bootHeadless` / `bootDesktop` | — | — |

### 3.4 The base contracts (K2 shape)

Lives in `@domia/contracts`. (Complete listing with all base types:
[MODULES.md §1](./MODULES.md).)

```ts
// The module box
export interface DomiaModule {
  readonly manifest: ModuleManifest;          // id, version, provides, requires
  init(host: ModuleHost): Promise<ModuleResult<void>>;   // register extension points
  dispose(): Promise<void>;                   // idempotent, reverse init order
}

// MIL Alloc / Control / Inquire / Free
export interface Context<TConfig, TState = Record<string, never>> {
  readonly id: ContextId;
  configure(patch: Partial<TConfig>): ModuleResult<void>;   // MControl  — sync
  inspect(): Readonly<TConfig & TState>;                    // MInquire — sync
  dispose(): Promise<void>;                                 // MFree    — async
}

// MIL Execute + Result
export interface Outcome<T> {
  readonly status: 'ok' | 'failed' | 'cancelled' | 'timeout' | 'suspended';
  readonly value: T;                          // defined when status === 'ok'
  readonly error?: DomiaError;
  readonly meta: OutcomeMeta;                 // timing, traceId, cost, artifact refs
  toJSON(): unknown;                          // lossless — what trace/store persist
}

export type ModuleResult<T> = Result<T, DomiaError>;        // neverthrow
```

**The lifecycle every K2 (context-owning) module obeys:**

```
host boots kernel
   └─ kernel.load(module)              module.init(host)      — register extension points
        └─ factory.alloc(config)       → Context               — MIL Alloc      (async)
             ├─ ctx.configure(patch)                           — MIL Control    (sync)
             ├─ ctx.inspect()                                  — MIL Inquire    (sync)
             ├─ <execute>(…) → Outcome<T>                      — MIL Execute    (async)
             └─ ctx.dispose()                                  — MIL Free       (async)
```

Rules that fall out:

- **R1** — a module's public surface is: manifest, factories, context types, outcome
  value types. Nothing else exported.
- **R2** — every execute returns `Promise<ModuleResult<Outcome<T>>>`: the `Result`
  layer answers *"could we even run?"* (contract/allocation errors); the `Outcome`
  layer answers *"what happened when we ran?"* (domain outcome, failure as data).
- **R3** — every alloc, execute, and dispose emits a trace span automatically (the
  kernel wraps factories with tracing middleware).
- **R4** — sync/async is a doctrine, not per-function taste: in-memory reads and
  config are **sync**; anything touching I/O, LLM, browser, disk, DB is **async**;
  long-running work is async start + `AsyncIterable` progress + cooperative
  `CancelSignal`. Full doctrine: [MODULES.md §2](./MODULES.md).

---

## 4. Maximally agentic — the research and the decision

### 4.1 The requirement

The product principle, stated plainly: **the task's steps cannot be determined in
advance**. The agent discovers the app while working, recovers from failures, and
re-plans as reality unfolds. Therefore nothing in Domia may hardcode steps, phases,
or plans — not the user (V1's authored workflows, deleted), and not the system
either. Structure exists only where the *user* wants a gate; never because the
architecture needs one. Modern models are strong enough to carry this.

### 4.2 What the field says (searched July 2026)

| Source | Finding | Consequence for Domia |
|---|---|---|
| Anthropic, *Building Effective Agents* | Workflows = LLMs orchestrated through **predefined code paths**; agents = the LLM **directs its own process and tool usage**. Use agents for open-ended problems where the number of steps is unpredictable. Prefer the simplest thing. | Domia's tasks are exactly the open-ended case ⇒ the unit of execution is an agent loop, not a phase graph. |
| Claude Code teardowns (agent-loop docs; *Dive into Claude Code*, arXiv 2604.14228) | The core is a **simple while-loop** (model → tools → repeat). All the value sits *around* it: context compaction layers, subagent delegation with fresh context returning only a summary, todo/plan as a **tool** (visible, trackable, reduces going off-track), permissions, extensibility (plugins/skills/hooks), append-only session storage. | Our pipeline module becomes a **loop + harness**, not stages. Plan-as-tool is validated as-is. |
| Anthropic, *How we built our multi-agent research system* | Orchestrator-worker where the **lead agent decides** when and how to spawn 3–5 parallel subagents; "prompt engineering was our primary lever" — delegation is taught in prompts, not coded; effort scales to query complexity by the model's judgment. | Sub-runs become `agent.spawn`/`agent.await` **meta-tools**; composition is the agent's decision. Personas are prompts, not classes. |
| Google ADK docs + multi-agent guides | ADK offers both: workflow agents (`SequentialAgent`/`ParallelAgent`/`LoopAgent`) as a *deterministic spine* when determinism is required, and **LLM-driven delegation** (dynamic routing by the model) when it isn't. | Confirms the split. We need determinism only in the harness (trace, gates, persistence) — never in task structure. |
| Computer/browser-use best practice (Claude computer-use guide; browser-agent surveys 2026) | Accessibility-tree-first perception; "static automation → agentic automation" (goals, not hardcoded selectors/paths); on failure give a **descriptive error + fresh snapshot** and instruct the agent to try a *different* approach — never blind-retry; exploration = perceive→act→verify; human confirmation for irreversible actions as a *deployment policy*. | Our observe/act + recovery design is right; recovery is an affordance (good errors + fresh observation + prompt guidance), not engine logic. Approvals = user-configured policy hook. |

### 4.3 The correction: draft 1's stage pipeline was still a workflow

The previous revision of this document fixed user-authored steps but then
hardcoded four **stages** (clarify → plan → execute → report). By Anthropic's own
definition that is a workflow — predefined code paths — merely at a coarser
grain. It re-imports the known failure: the model wants to ask a clarifying
question *mid-execution* (it discovered something), wants to re-plan *after*
acting, wants to verify *before* finishing. Phases fight the model. Deleted.

### 4.4 The model: one loop, a tool belt, a harness ring

```
                  ┌───────────────────────────────────────────────┐
                  │                HARNESS (code, deterministic)   │
                  │   router · gates (pause/cancel/answer)         │
                  │   informants (signals, never vetoes)           │
                  │   trace + persist · approval policy (user opt) │
                  │                                                │
                  │           ┌───────────────────────┐            │
 user request ──▶ │           │       THE LOOP        │            │ ──▶ RunReport
                  │           │  observe → step → act │            │
                  │           └───────────────────────┘            │
                  │        the agent's tool belt (its choices):    │
                  │   target:  browser.* input.* shell.* fs.* screen.*
                  │   plan.*   user.ask   agent.spawn / agent.await│
                  │   context.handoff     skill.*      suspend     │
                  └───────────────────────────────────────────────┘
                    behavior lives in prompts/personas — not in code
```

Where each former stage went:

| Draft-1 stage | Now | Why |
|---|---|---|
| clarify | **`user.ask` meta-tool**, available every turn | ambiguity is discovered mid-task, not only at t=0; `questions:'never'` removes the tool and the prompt says "state assumptions in the plan instead" |
| plan | **`plan.*` tools** (unchanged from draft 1) | exactly the validated todo-as-tool pattern — visible, trackable, agent-owned |
| execute | **THE loop** | the only execution construct left |
| report | **`final` turn**; the prompt encourages spawning a fresh-context `verifier`/`reporter` persona first when stakes warrant | fresh-context verification is honest, and *whether* to pay for it is the agent's call |

### 4.5 What stays code, what becomes prompt

**Code (the harness — deterministic on purpose):** tool routing + Zod validation;
tracing + persistence of every exchange; gates (pause/cancel/answer — user
authority); informants (budget, duration, plan staleness, context pressure, idle —
delivered as signals in the next step); target/session lifecycle; the approval
policy hook (user-configured checkpoint on `risk: 'dangerous'` tools — off by
default, recommended for unattended runs); RunReport assembly.

**Prompt (`prompts/personas/*.md` — where behavior lives):** when to ask the user;
when and how granularly to plan; failure recovery style ("never retry the same
action twice — diagnose, then try a different element/method/tool"); when to
spawn subagents and how to brief them; when to hand off context; verification
discipline before `final`; tone of summaries.

### 4.6 Subagents — orchestration by the agent

`agent.spawn { persona, request, share? }` → child run (own `TargetSession`, own
conversation, `parentRunId` set) → child works → **only its `final` summary
returns** to the parent as the tool result (context isolation, per Claude Code +
research-system lessons). `agent.await` joins parallel children. **Personas** are
named `{prompt, model, toolset}` configs — data in `prompts/personas/` + settings,
selectable per spawn: `explorer` (cheap model, observe-heavy), `verifier` (fresh
eyes, acceptance-criteria driven), `reporter` (cheap, no target tools), `lead`
(the default main-loop persona). Capability-gated as before (no spawn on
CDP-attach targets).

### 4.7 Long tasks — context endurance

`context.handoff { summary, nextFocus }` meta-tool: the agent writes its own
handoff, gets a fresh conversation seeded with it (+ current plan + last
observation), same run continues — V1's `iterate`, now validated by compaction
practice. The harness raises a `context-pressure` informant as the window fills;
it never truncates silently.

### 4.8 Recovery — affordances, not logic

The harness's whole recovery contribution: (1) descriptive, structured tool
errors (`Outcome.error` with what/why/state), (2) a fresh observation attached to
the next step, (3) the persona prompt's recovery discipline. No retry wrappers,
no failure counters, no "stuck detection" in code — the V1 lesson (informants,
not vetoes) now backed by the browser-agent literature.

**Sources:**
[Building Effective Agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents) ·
[How we built our multi-agent research system (Anthropic)](https://www.anthropic.com/engineering/multi-agent-research-system) ·
[How the agent loop works (Claude Code docs)](https://code.claude.com/docs/en/agent-sdk/agent-loop) ·
[Dive into Claude Code (arXiv 2604.14228)](https://arxiv.org/abs/2604.14228) ·
[ADK multi-agent patterns (Google Developers Blog)](https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/) ·
[LLM Agents vs. Workflows in ADK (Google Cloud Community)](https://medium.com/google-cloud/llm-agents-vs-workflows-and-how-google-adk-gives-you-both-7301d6fb1c4c) ·
[Best practices for computer and browser use with Claude](https://claude.com/blog/best-practices-for-computer-and-browser-use-with-claude)

---

## 5. Module map and dependency rules

```
 LAYER 4 — surfaces        ┌──────────┐   ┌──────────┐
 (talk to api only)        │  @ui     │   │  @cli    │
                           └────┬─────┘   └────┬─────┘
                                └─────┬────────┘
 LAYER 3 — facade               ┌─────┴─────┐
 (talks to L2 modules)          │   @api    │
                                └─┬──┬──┬──┬┘
                     ┌────────────┘  │  │  └─────────────┐
 LAYER 2 — domain    ▼               ▼  ▼                ▼
 modules      ┌─────────┐   ┌──────────────┐      ┌───────────┐
              │  @case  │   │    @loop     │      │  queries  │
              └────┬────┘   │ (the harness)│      │ (@store,  │
                   │        └─┬────┬────┬──┘      │  @trace)  │
                   │          ▼    ▼    ▼         └───────────┘
                   │    ┌───────┐┌──────┐┌───────┐
                   │    │@agent ││@tools││ @plan │
                   │    └───────┘└──────┘└───────┘
 LAYER 1 — infra   ▼        ▼       ▼        ▼
 modules      ┌──────────────────────────────────┐
              │      @store           @trace     │
              └──────────────────────────────────┘
 LAYER 0 — ground
              ┌──────────────────────────────────┐
              │      @kernel       @contracts    │
              └──────────────────────────────────┘
```

**Dependency rules (CI-enforced by `scripts/check-modules.mjs`):**

| Rule | Statement |
|---|---|
| D1 | Everyone may import `@domia/contracts` (types only) and `@domia/kernel` (registry API). |
| D2 | A module never imports another module's package. Cross-module use goes through `host.resolve(extensionPoint)` — interfaces from contracts, implementations located at runtime. |
| D3 | `@ui` and `@cli` import only the `DomiaApi` type + a transport client. Never a domain module. |
| D4 | `@api` orchestrates L2 modules; it contains no business logic — use-cases delegate. |
| D5 | Hosts (`@desktop`, `@headless`) are the only places where *all* packages meet. |
| D6 | Third-party plugins get the exact same `ModuleHost` our built-ins get. No privileged path. |
| D7 | `@contracts` imports nothing but `zod` and `neverthrow`. No Node builtins. |

Why `host.resolve` instead of package imports (D2): every module stays independently
versioned, testable, replaceable — exactly how MIL modules only meet through
MIL_IDs. The kernel is the linker.

---

## 6. The module boxes

One paragraph per box — purpose and boundaries. **Full API (every function,
context/result inventory, sync/async): [MODULES.md](./MODULES.md).**

| Box | Purpose | Explicitly NOT responsible for |
|---|---|---|
| **contracts** | The shared language: branded IDs, `DomiaError` catalog, base `Context`/`Outcome`, every module's public interface as types, Zod schemas, typed-const vocabularies. MIL's header files — zero logic. | any runtime behavior |
| **kernel** | `MappAlloc`: loads modules in dependency order, extension-point registry, typed event bus, scoped config/loggers, shutdown. No decorators, no `reflect-metadata` — registration is explicit code in `init()`. | persistence, HTTP, scheduling |
| **trace** | The system's memory of what happened: span trees, events, artifacts (the `MbufAlloc`), token/cost accounting, sinks (jsonl/store/otlp), and the **replay source** (`agentExchanges`). | interpreting data (api shapes it), storage engine details |
| **store** | The only package that knows SQL: SQLite schema, migrations, transactions, narrow repos (cases, runs, plans, exchanges, artifacts index, settings). | domain validation, blob storage, business decisions |
| **tools** | Everything the agent can *do*: `ToolProvider`s attach to one **TargetSession** (`MsysAlloc`) with a single `invoke` middleware path (`validate → span → informants → execute → capture → record`). The default web/electron provider is **playwright-mcp** via `McpToolProvider` (ECOSYSTEM E2); MCP servers a case mounts (E1) become tools on the same path; capture/os-a11y/vision/shell/files fill the rest. | deciding when to call tools (loop), which tools the agent sees (persona toolset + tool policy), storing results |
| **agent** | The brain socket: one **`AiSdkProvider`** (Vercel AI SDK, 25+ model providers — ECOSYSTEM E3) + `ReplayProvider` alloc an **AgentContext** — a propose-only conversation handle (`step → act|ask|final`; tools declared without execute so the SDK returns calls, not results). Never executes tools. Snapshot/restore for suspend-resume. | executing tools, choosing toolsets, the loop, prompt content (lives in `prompts/*.md`) |
| **case** | The durable definition of a target: `TargetSpec` (web/electron/desktop/shell), auth state (encrypted storageState), env/secrets, files, constraints-as-informants. `allocContext` resolves secrets into a ready-to-run **CaseContext**. | launching the target (tools), execution (loop) |
| **plan** | The living plan: agent-generated items with revisions, persisted + streamed live; exposes `plan.*` tool manifests (`propose/add/start_item/complete_item/drop_item/revise/note`). Data + tools only. | executing anything, blocking anything (informants, not vetoes) |
| **loop** | The agentic harness and the **only place agent meets tools**: ONE loop (observe → step → act), the meta-tool belt (`user.ask`, `agent.spawn/await`, `context.handoff`, `skill.*`, `suspend` — `plan.*` joins from plan), a prefix router, gates (pause/cancel/answer), informants, `LoopRun` with live events, personas as prompt configs. | LLM specifics, tool specifics, task structure (the agent's), rendering, row storage |
| **api** | The one facade surfaces consume — typed `DomiaApi` served in-process (CLI), tRPC-over-IPC (desktop), HTTP+SSE (headless). Validates with contracts schemas, delegates, shapes read models, streams run/plan events. Wire-safe errors only. | business logic, transports (hosts), rendering |
| **ui** | React renderer, feature-sliced (cases, runs, trace, settings), consuming only `DomiaApi`. Flagship: live run view — activity lane, **live plan board**, agent turns, tool calls with before/after screenshots, question cards inline, cost meter. | any Node/OS access, business rules |
| **cli** | Same api, terminal-shaped: `domia run goal`, `domia case …`, `domia plan show`, `domia trace show`, `domia tools list`, `domia doctor`. `--watch` consumes the same event stream as the UI; `--json` everywhere. | logic beyond parsing + rendering |
| **hosts** | Composition roots (`bootHeadless`, desktop = same boot + Electron shell + IPC transport). The only importers of everything (D5). | anything reusable |

---

## 7. How the modules connect

### 7.1 Connection matrix

*(rows use columns; ✦ = via extension point / contracts interface only)*

| uses → | contracts | kernel | trace | store | tools | agent | plan | case | loop | api |
|---|---|---|---|---|---|---|---|---|---|---|
| **kernel** | ✦ | — | | | | | | | | |
| **trace** | ✦ | ✦ | — | ✦ (StoreSink→rows) | | | | | | |
| **store** | ✦ | ✦ | | — | | | | | | |
| **tools** | ✦ | ✦ | ✦ (spans+artifacts) | | — | | | | | |
| **agent** | ✦ | ✦ | ✦ (exchanges) | | ✦ (manifest type) | — | | | | |
| **plan** | ✦ | ✦ | ✦ (revisions) | ✦ (PlanRepo) | ✦ (manifest type) | | — | | | |
| **case** | ✦ | ✦ | ✦ | ✦ (CaseRepo) | ✦ (TargetSpec type) | | | — | | |
| **loop** | ✦ | ✦ | ✦ | ✦ (RunRepo) | ✦ (session) | ✦ (contexts) | ✦ (PlanContext) | ✦ (CaseContext) | — | |
| **api** | ✦ | ✦ | ✦ (queries) | ✦ (queries) | ✦ (catalog) | ✦ (providers) | ✦ (plan feed) | ✦ | ✦ (engine) | — |
| **ui / cli** | ✦ (DomiaApi type) | | | | | | | | | ✦ |

Reading it: **loop is the only row touching agent AND tools AND plan** — the
mediation guarantee is structural, not conventional. **store and trace are the only
stateful floors.** **api is the only thing surfaces see.**

### 7.2 The composition chain at run time

```
CLI/UI ──DomiaApi──▶ api.runs.start(caseId, request, options)
                        │
                        ▼
              case.allocContext(caseId) ─────────────▶ CaseContext (secrets, workdir, target)
                        │
                        ▼
              tools.allocSession(target) ◀── providers attach (playwright, capture, …)
                        │
                        ▼
              plan.allocContext(runId, goal) ────────▶ PlanContext (empty plan, rev 0)
                        │
                        ▼
              loop.engine.alloc(binding) ──────────────▶ LoopRun ; store.runs.insert
                        │ start()
                        ▼
        ┌── THE loop (lead persona) ────────────────────────────────┐
        │  agents.alloc(persona 'lead') → AgentContext              │
        │      (prompt, model, toolset = target manifests + belt)   │
        │  loop:                                                    │
        │      session.observe → agent.step → router:               │
        │         browser./input./shell./fs./screen.* → session     │
        │         plan.*                              → planCtx     │
        │         user./agent./context./skill./suspend → meta belt  │
        │      … until turn = final → Outcome<RunReport>            │
        └───────────────────────────────────────────────────────────┘
                        │
     every box above ──▶ trace (spans, exchanges, artifacts, plan revisions)
     state transitions ─▶ store (runs, plans, plan_items, exchanges)
     progress ──────────▶ kernel.events ──▶ api.watch ──▶ UI live view / CLI --watch
```

---

## 8. User journeys — data flow and validation

The design was validated by walking every user journey against the module APIs
and following the data. Format per journey: **user action → call chain → data
written → live feedback**. Findings that forced design patches are in §8.B.

### 8.A Journey walkthroughs

**J0 — Install & health.** `domia doctor` → `bootHeadless(minimal)` → checks:
Playwright browsers present, provider auth resolvable, db writable, prompts dir
found → table + exit code. Writes nothing. Exercises kernel load order + config.

**J1 — Create a case (with auth).** UI case editor or `domia case add --kind web
--url https://shop…` → `api.cases.create` → `CaseService.create` (Zod) →
`store.cases.insert`. Then `domia case auth <id>` → `CaseService.captureAuth` →
`tools.allocSession({headed: true, interactive: true})` → **user logs in by
hand** → provider exports `storageState` → encrypted → `assets.authState`.
Finally `cases.validate` → reachability + auth freshness (advisory `Outcome`).
Data: `cases` row + encrypted auth blob. Feedback: validation panel.

**J2 — Quick run (CLI).** `domia run "export invoices to csv" --case shop
--watch` → `api.runs.start` → RunRegistry allocs the chain: `case.allocContext`
→ `loop.engine.alloc(binding)` → `run.start()` in background; CLI consumes
`runs.watch` (activity lane in terminal). THE loop: observe → step → route → …
→ `final`. Data: `runs`, append-only `exchanges`, `trace_*`, `artifacts`; a
plan only if the agent chose to keep one. Exit code = outcome.

**J3 — A bigger run (UI) — the flagship.** Launcher (case + request) →
`runs.start`. Same single loop; what happens next is the **agent's choosing**,
all of it visible: it may `user.ask` ("CSV or PDF?") — run `waiting_user` →
question card → the reply returns as the tool result; it typically
`plan.propose`s (plan board fills via `run.plan.changed`); it acts (turns/calls
stream; before/after screenshots by artifact ref; board ticks via
`start_item`/`complete_item`); mid-way it may re-plan, ask again, or
`agent.spawn` a `verifier` persona before finishing; it ends with `final` →
RunReport card (verdict optional). Data: J2 + `plans`, `plan_items`,
`plan_revisions` audit + `report_json`.

**J4 — Control mid-run.** Pause/cancel buttons, checkpoint answers →
`api.runs.pause|cancel|answer` → RunRegistry → live `LoopRun` method → gates
honored between turns and between calls (cooperative). Cancel is the only hard
stop. Dead process ⇒ registry miss ⇒ `RUN_NOT_LIVE` error with a resume hint.

**J5 — Suspend / resume across days.** Agent calls `suspend` (or idle
auto-suspend, F6) → `agent.snapshot()` → `snapshots` row + blob →
`session.dispose()` → run `suspended`. Later `domia run resume <id>` → fresh
`CaseContext` → new `TargetSession` → `agent.restore` → the loop continues
mid-run. Plan and exchanges were rows all along — nothing to rebuild.

**J6 — Review & replay.** UI trace tab: `traces.timeline` (spans + turns +
calls), filmstrip (artifact refs), plan history, cost rollup; `domia trace show
<runId> --tree` in terminal. The test suite replays any recorded run:
`agent = replay(runId)` + real browser on fixtures → deterministic e2e.
Read-only journey — zero writes.

**J7 — Switch models / go local.** Settings → `settings.patch { personas: {
lead: { provider: 'ollama', model: '…' } } }` → next run's persona config
resolves it; per-run override via `runs.start` opts. `agents.models('ollama')`
queries the local daemon. No code change, no restart.

**J8 — Extend with a plugin / mint a skill.** Drop a folder in
`~/.domia/plugins/` (manifest + entry) → next boot `loadUserPlugins` → same
`ModuleHost` as built-ins → new tools appear in `tools.catalog` → agent sees
them via `toolset: 'full'`. Skill: pick a clean run → mint a recording artifact
+ `skill.<name>` manifest → future agents invoke it as one composite tool.

**J9 — CI / headless.** `bootHeadless` in CI → `domia run … --no-questions
--json` → exit code gates the CI pipeline; the replay e2e corpus
runs LLM-free; reports generated from `report_json`.

### 8.B What the walk exposed — findings folded back into the design

Six gaps surfaced; all patched (and reflected in MODULES.md):

| # | Gap found by the journey walk | Patch |
|---|---|---|
| F1 | `runs.answer/pause/cancel` must reach a **live** `LoopRun`, but api was designed stateless | **`RunRegistry`** in `@api`: in-memory `RunId → LoopRun` map, evicted on terminal/suspend; store rows remain the source of truth for dead runs |
| F2 | No way to produce `authState` without hand-editing files | **`CaseService.captureAuth`**: headed interactive session, user logs in, storageState exported + encrypted |
| F3 | Two concurrent runs on an attach-target (electron CDP, OS desktop) would fight over one app | **Target lock** in `tools.allocSession`: isolated targets (fresh browsers) unlimited; attach targets exclusive → `TARGET_BUSY` (replaces V1 "lanes") |
| F4 | Screenshots/video over Electron IPC would choke the bridge | Desktop host serves artifacts via a custom protocol (`domia-artifact://<sha256>`) streaming from disk; the UI receives refs, never bytes |
| F5 | A UI opening a run view mid-run missed all earlier events | `runs.watch` contract: first emission is a `sync` snapshot (`RunView`), then live events |
| F6 | `waiting_user` holds a live browser forever if the human walks away | Idle informant → auto-suspend after configurable idle (snapshot + release session); `answer`/`resume` reawakens. Signal-driven release, not a veto |

Sections 8.1–8.6: the module-level reference flows underneath these journeys.

### 8.1 Boot

```
host → createKernel(config)
     → kernel.load(modules)          topo-sort by manifest.requires
        each: module.init(host)      register extension points
     → api bound to transport(s)
     → ready (doctor checks green)
```

### 8.2 A run, end to end (module level)

```
1  api.runs.start(caseId, "export last month's invoices")
2  case.allocContext → tools.allocSession(web) → plan.allocContext → LoopRun
3  agents.alloc(persona 'lead') — strong model, full belt
4  observe → agent.step(request + observation)
5  → act: [user.ask "Which format — CSV or PDF?"]        agent's choice, not a phase
6  gate 'waiting_user'; UI/CLI shows question; runs.answer(...) → reply = tool result
7  → act: [plan.propose(5 items)]                         plan board fills live
8  → act: [plan.start_item i1, browser.click(ref=e12)] → router → results + fresh observe
9  informants inject signals (spend, duration, stale plan) — agent reads, decides
10 plan.complete_item / plan.revise as reality unfolds
11 (stakes high? agent spawns 'verifier' persona, awaits its summary)
12 agent.step → final { summary, verdict?, value? }
13 harness assembles RunReport (+ plan snapshot + stats); run terminal; trace flushed
```

### 8.3 Options, not modes

There are no presets and no modes — always the same loop. `RunOptions` only
trims the belt or adds user gates: `questions: 'never'` removes `user.ask`
(CI); `approvals: 'dangerous'` checkpoints risk-tagged tools (unattended
boxes); persona overrides swap models. A spawned child is just a run with
`parentRunId` and a persona.

### 8.4 Deterministic replay (the test story)

```
record: any real run — trace stored full agent exchanges (incl. user.ask Q&A) + tool outcomes
test:   agent.provider = replay(runId)   ← serves recorded turns, one by one
        tools          = REAL playwright on REAL fixture page
        loop           = identical path (router, gates, informants)
assert: outcomes equal, plan revisions equal, screenshots comparable, zero LLM cost
```

Replay lives at the **agent boundary** so loop + plan + tools + trace are
exercised for real.

### 8.5 Suspend / resume

```
suspend tool (or user.ask with detached surface, F6):
  agent.snapshot() → store ; session.dispose() ; run 'suspended' (plan persists as data)
domia run resume <runId>:
  case.allocContext → new TargetSession → agent.restore(snapshot) → loop continues mid-run
```

### 8.6 Parallel sub-runs

`agent.spawn {persona, request}` → child `LoopRun` (own TargetSession/browser,
own AgentContext, `parentRunId` set); `agent.await` joins — **only the child's
`final` summary returns** (context isolation). Targets that cannot isolate
(CDP-attach) don't get the tool — capability-gated, agent never sees what it
can't use (V1 keeper).

---

## 9. The extension model — plugins everywhere

One rule: **built-ins and third-party extensions register through the same
extension points** (D6). A plugin is a package (or local folder) exporting a
`DomiaModule`; `loadUserPlugins` loads it into the same kernel.

| Extension point | Interface | You write | Examples |
|---|---|---|---|
| `tools.provider` | `ToolProvider` | manifests + attach + execute | any MCP server (via `McpToolProvider`), Appium (mobile), os-a11y desktop |
| `agent.provider` | `AgentProvider` | alloc → AgentContext.step | Bedrock, Azure OpenAI, llama.cpp direct, ADK adapter |
| `loop.metaTool` | `MetaToolHandler` | manifests + dispatch | a `memory.*` belt (cross-run learned facts), approval-workflow tools, custom spawn strategies |
| `trace.sink` | `TraceSink` | write(record) | Slack notifier, Datadog, custom analytics |
| MCP mount (config, not code) | — | a `Case.assets.mcpServers` entry | GitHub, Slack, Postgres, any of 5,800+ MCP servers (ECOSYSTEM E1) |

Skills follow the **Agent Skills open standard** (SKILL.md — ECOSYSTEM E4),
adopted by Claude Code / Codex CLI / Gemini CLI, so Domia skills are portable both
ways. A skill = a `prompts/skills/<name>/SKILL.md` folder (frontmatter +
instructions), offered only when the request matches its description (progressive
disclosure). Domia adds one optional asset — `recording.json` — that the built-in
`skill` handler can replay deterministically. The agent mints and reuses skills;
no user-authored steps involved.

**MCP is the primary extension path.** Rather than everyone writing a
`tools.provider`, a case mounts any Model Context Protocol server
(`assets.mcpServers`); `McpToolProvider` lists and dispatches its tools through
the same session middleware — 5,800+ servers become capability with zero Domia
code (ECOSYSTEM E1). Native `tools.provider` plugins remain for things MCP can't
express (custom capture hooks, OS-a11y grounding).

Plugin manifest:

```jsonc
// ~/.domia/plugins/sql-tools/domia-plugin.json
{ "name": "sql-tools", "version": "0.1.0", "entry": "./dist/index.js",
  "provides": ["tools.provider"] }
```

Trust: plugins run in-process (code you installed); case workdir sandbox + secret
non-logging still apply. Future hardening: run `tools.provider` plugins
out-of-process behind the same interface — the extension point makes the swap
invisible.

---

## 10. Doing Playwright right

V1's stated pain. V2 concentrates every Playwright lesson in ONE provider with
non-negotiable practices:

1. **One owner.** Only `tools/providers/playwright/` imports `playwright`. Web and
   Electron (launch or CDP-attach) live in this provider. No sensors, managers, or
   drivers elsewhere (kills autopsy G).
2. **Observe = ARIA snapshot with stable refs.** The agent sees a numbered
   accessibility tree (`ref=e12`, role, name, state) — compact, diff-able,
   token-cheap. Acting is **by ref** (`browser.click {ref}`), resolved via
   `getByRole`/locator — never LLM-invented CSS/XPath, never raw coordinates
   (native-input provider is the explicit DOM-less fallback).
3. **Auto-waiting, zero sleeps.** Locator actions carry Playwright's actionability
   waits. No `waitForTimeout`; a `browser.waitFor {ref|url|text}` tool exists for
   explicit conditions, with agent-tunable timeout (informant on expiry, never a
   run-killer).
4. **Auth is data, not steps.** `storageState` per case (`CaseAssets.authState`,
   encrypted). Login flows recorded once as a skill, replayed only when state expires.
5. **Tracing native.** Playwright tracing + video hook into capture/trace
   middleware — every action's before/after screenshot is an artifact ref
   automatically; `trace.zip` optionally attached to the run.
6. **Session hygiene.** One `BrowserContext` per TargetSession; sub-runs get fresh
   contexts (own cookies/cache); dispose is deterministic (kernel tracks live
   contexts — no zombie browsers).
7. **Downloads/uploads/dialogs are tools** (`browser.download.expect`,
   `browser.upload`, `browser.dialog.arm`) — never unhandled events that hang a run.

---

## 11. Data model

SQLite, one baseline schema (pre-1.0 discipline kept from V1), blobs on disk.

```
cases         id PK, name, target_json, assets_json, constraints_json, tags_json,
              created_at, updated_at, archived_at?
runs          id PK, case_id FK, parent_run_id FK?, persona, status, request,
              options_json, report_json?, started_at, ended_at?
plans         id PK, run_id FK UNIQUE, revision, status, updated_at
plan_items    id PK, plan_id FK, seq, title, intent, status, note?, updated_at
plan_revisions id PK, plan_id FK, revision, op_json, at        -- full audit of plan.* ops
exchanges     id PK, run_id FK, seq, direction(agent|tool|user),
              payload_json, usage_json?, at                    -- replay source
trace_spans   span_id PK, trace_id, parent_span_id?, run_id FK?, name, attrs_json,
              status, started_at, ended_at
trace_events  id PK, span_id FK?, run_id FK?, name, attrs_json, at
artifacts     id PK, run_id FK?, kind, mime, bytes, sha256 UNIQUE, path, label?, at
snapshots     run_id PK FK, agent_provider, conversation_blob_path, at   -- suspend/resume
settings      key PK, value_json, updated_at
```

Indexes on `runs(status, started_at)`, `exchanges(run_id, seq)`,
`plan_items(plan_id, seq)`, `trace_spans(run_id)`, `artifacts(sha256)`.
FK-enforced, WAL, single writer. No `workflows` table, no `stage_runs` table —
task structure belongs to the agent and is recorded in plans + exchanges.

---

## 12. Repository layout

npm workspaces monorepo — module-first (kills autopsy F):

```
DOMIA_V2/
  package.json                 workspaces + shared scripts
  tsconfig.base.json           strict flags (V1 keeper)
  scripts/check-modules.mjs    D1–D7 boundary rules, god-file rule
  prompts/                     *.md role prompts (clarifier, planner, executor, reporter) — never in TS
  docs/                        DESIGN.md, MODULES.md, ADRs
  packages/
    contracts/
    kernel/
    trace/                     src/ + sinks/{jsonl,store,otlp}/
    store/                     src/ + schema.ts + repos/
    tools/                     src/ + providers/{mcp,capture,os-a11y,vision,native-input,shell,files}/  # mcp mounts playwright-mcp + case servers
    agent/                     src/ + providers/{aisdk,replay}/   # aisdk = 25+ model providers
    case/
    plan/
    loop/                      src/ + meta/{ask,spawn,handoff,skills,suspend}.ts
    api/
    ui/
    cli/
    hosts/desktop/
    hosts/headless/
    conformance/               provider test kits (§15)
  tests/
    e2e/                       real-stack tests per module + full-run replays
    fixtures/                  pages, electron app, llm recordings
```

Inside a package: `src/index.ts` exports the public surface only; `src/internal/`
is enforcement-checked as private. One concern per file, ~300-line ceiling.

---

## 13. What we keep from V1, what we drop

**Keep (proven):**

- `neverthrow` `Result` across boundaries; typed-const over enums; branded IDs.
- Zod schemas at every process boundary; no secrets/stacks over the wire.
- Prompts as `prompts/*.md`, never in code.
- e2e-only testing with LLM replay; real browser, real DB.
- Per-run `trace.jsonl` + optional OTLP; events over direct logging.
- Suspend/resume via conversation snapshots; dual Gemini auth (key/ADC).
- Verdict-less `final`; informants-not-vetoes; **no loop-detection** (hard V1 lesson).
- Capability gating (agent never offered tools the target can't honor).
- Architecture checker in CI; god-file rule; Electron security posture.

**Drop (caused the pain):**

| Dropped | Replaced by |
|---|---|
| **User-authored workflow steps** (whole `backend/workflows/` machinery) | Agent-generated living plan (`@domia/plan`) + one agentic loop (`@domia/loop`) |
| Layer-first folders | Module packages (§12) |
| tsyringe + `reflect-metadata` + decorators | Kernel extension-point registry, explicit `init()` |
| ADK-owned agent loop | Propose-only `AgentContext.step` + loop mediation |
| `ToolDependencies` 17-field grab-bag | `TargetSession` + invoke middleware |
| 20-service `backend/runs/` constellation | One loop + meta-tool belt + middleware + informants |
| Separate Workflow vs Run machinery | One loop; every run is the same construct |
| **Fixed stage pipeline** (V2 draft 1: clarify→plan→execute→report) | One loop + meta-tool belt — task structure is the agent's (§4) |
| Port sprawl (4 automation port families) | `ToolProvider` + `TargetSession.observe` |
| Plugins/skills as bolt-on loaders | Native extension points for everything (D6) |
| sql.js/WASM default | better-sqlite3 (interface keeps WASM swappable) |

---

## 14. Implementation roadmap

Tracer-bullet slices — each lands end-to-end and demo-able.

| Slice | Delivers | Proves |
|---|---|---|
| **0. Ground** | contracts + kernel + trace(jsonl) + `domia doctor` | module load order, extension points, spans |
| **1. Hands** | tools module + playwright & capture providers + `domia tools invoke` | TargetSession, invoke middleware, artifacts, ARIA-ref observation |
| **2. Brain** | agent module + gemini & replay providers + `domia agent smoke` | propose-only step contract, exchange tracing, recording |
| **3. Pulse** | loop harness (router, gates, informants) + `domia run` | **first autonomous run**, mediated loop, live events, replay e2e |
| **4. Memory** | store + case modules; runs persisted; `domia case add` | repos, CaseContext w/ secrets, run history |
| **5. Mind** | plan module + meta belt (`user.ask`, `agent.spawn/await`, `context.handoff`) + personas + `domia plan show` | living plan, agent-driven questions, sub-runs, per-persona models |
| **6. Face** | api over IPC+HTTP + UI shell (cases, runs, live run view w/ plan board, timeline) | facade discipline, live feeds, artifact streaming |
| **7. Reach** | ollama + openai-compat; native-input/shell/files providers; plugin loading; skills (record→replay→tool) | local models, DOM-less targets, D6 for real |
| **8. Scale** | parallel-spawn hardening, desktop packaging, conformance kits published | isolation, packaging, third-party story |

Gate for every slice: `tsc --noEmit` clean, `check-modules` clean, e2e green, demo
command in the slice's PR description.

---

## 15. Testing strategy

Same religion as V1 — **no mocks** — with a new instrument:

1. **Conformance kits** (`packages/conformance/`). Each extension point ships an
   executable spec: `toolProviderKit(provider)` runs ~30 behavioral assertions
   (manifest validity, Zod arg rejection, timeout outcome shape, artifact emission,
   dispose idempotency). `agentProviderKit` asserts the propose-only contract
   (never executes, ask/final shapes, snapshot round-trip) — Gemini and Ollama pass
   the same kit. `metaToolKit` for custom belt tools. Third parties get the kits —
   MIL-style certification.
2. **Replay e2e.** Full runs with `agent=replay` + real browser on fixture pages —
   deterministic, LLM-free, CI-friendly. `user.ask` answers replay from recorded
   exchanges. Recording refresh is a script, not a chore.
3. **Live smoke** (env-gated). A few real-LLM runs (cheap model) nightly — catch
   prompt/SDK drift.
4. **Module e2e.** Each package's tests boot a real kernel with the minimal module
   set — never a mocked host.
5. **Boundary CI.** `check-modules.mjs` enforces D1–D7 + god-file + internal-privacy.

---

## 16. Open decisions

Parked consciously — none block slices 0–3:

1. **Native-input library** — `@nut-tree/nut-js` licensing changed; evaluate
   alternatives before slice 7.
2. **Out-of-process plugins** — in-process first; the extension-point seam makes
   later isolation (worker/subprocess + RPC) non-breaking. Decide at slice 8.
3. **Approval policy default** — `approvals: 'dangerous'` is what computer-use
   guidance recommends for unattended runs; interactive default stays `'off'`
   (max freedom). Revisit after real usage.
4. **Verifier persona depth** — how much structure its prompt needs (evidence
   format, acceptance-criteria discipline) — tune on real runs. A custom
   `MetaToolHandler` ships as the reference K3 example (dog-fooding D6).
5. **Mobile (Appium)** — V2 ships it as the reference third-party-style
   `ToolProvider` (dog-fooding again).
6. **Multi-user / remote daemon auth** — headless binds localhost only (V1 posture)
   until a real remote use-case appears.

---

## 17. Single-host now — the seam kept open for later

**Decision: DOMIA runs entirely in one host process. No distribution is built.**
Everything below is the *default and only* mode; the rest of this section records
why scaling later will be a host-only change, not a redesign — so we don't
accidentally close that door.

- One process: the kernel loads every module; `RunRegistry` holds live `LoopRun`s
  in memory (F1); `TargetSession`s (playwright-mcp, capture, os-a11y) run locally;
  MCP servers are local child processes. Simple, debuggable, enough.
- **The seam is preserved on purpose (the MIL / Distributed-MIL lesson,
  Distributed MIL).** The loop touches the target
  only through `TargetSession.{invoke, observe, setHeaded, handoff}`, and modules
  meet only through `host.resolve` + contracts. Because every seam is an allocated
  handle with a uniform API, *if* scale is ever needed it is added by swapping a
  local `ToolService` for a remote proxy and adding a node registry in the host —
  no domain module changes. That is the pack/unpack property; we keep it, we don't
  use it.
- **Not built (explicitly deferred, no code, no slice):** remote/worker sessions,
  node registry, stateless multi-replica control plane, container-desktop targets,
  cross-machine leases. Revisit only when a real workload needs more than one host.

Guardrails that already hold single-host and would carry over unchanged:
informants-not-vetoes, user-owned tool policy + approvals, secrets resolved in
memory and never traced.
