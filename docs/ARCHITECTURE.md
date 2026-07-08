# DOMIA Architecture

The single canonical reference for layers, boundaries, and how to add features. Code enforces what it can; this document explains what it can't.

## Principles

- Prefer mature industry tooling over custom orchestration code.
- Keep product-specific logic custom; outsource generic runtime plumbing.
- Make boundaries obvious in code and enforce them in CI.
- Remove speculative features and unfinished surfaces until they are real.
- Reduce code volume whenever an abstraction does not clearly earn its keep.

## Layers

| Layer | Owns | Forbidden imports |
|---|---|---|
| `apps/` | Entry points (Electron, CLI, future server) | `@frontend` (only `apps/desktop/main.ts` mounts the renderer) |
| `frontend/` | React renderer, Zustand stores, tRPC client | `@infrastructure`, Node builtins |
| `backend/` | Application orchestration, bounded contexts | `@infrastructure` (except `backend/container/`), `@frontend`, `@apps` |
| `domain/` | Pure business types, ports, entities, value objects, errors | Anything outside `@domain` and `@shared` |
| `infrastructure/` | Adapters that implement domain ports | `@backend`, `@frontend`, `@apps` |
| `shared/` | Pure types, contracts (Zod schemas), defaults, reliability helpers | Node builtins inside `shared/defaults/*` |

## Bounded contexts inside `backend/`

| Context | Folder | Responsibility |
|---|---|---|
| Runs | `backend/runs/` | Agent run lifecycle + the meta-agent loop (`MetaAgentLoopService`) |
| Workflows | `backend/workflows/` | Multi-step orchestration over runs |
| Settings | `backend/settings/` | Config facade |
| Prompts | `backend/prompts/` | Prompt override facade |
| Plugins | `backend/plugins/` | Plugin enable/disable + listing |
| Platform | `backend/platform/` | Platform negotiation + session lifecycle |
| Policy | `backend/policy/` | Cross-context policy gates (readiness today) |

Cross-context imports are allowed (e.g. `WorkflowStepRunnerService` calls `RunUseCase`), but only top-level surfaces — never reach into another context's private files.

## CI guards (`scripts/check-architecture.mjs`)

- `god-file` — no source file over 400 lines; split by concern before it grows.
- `domain-purity` — `domain/` imports nothing outside `domain/` and pure utilities.
- `backend-boundary` — `backend/` may not import `@infrastructure`/`@frontend`/`@apps` except `backend/container/`.
- `infrastructure-boundary` — `infrastructure/` may not import `@backend`/`@frontend`/`@apps`.
- `frontend-boundary` — `frontend/` may not import `@infrastructure`; may touch `@backend` only via `@backend/dto` and `@apps` only via the tRPC router type.
- `apps-boundary` — `apps/` may not import `@infrastructure`.
- `desktop-ipc-boundary` — `apps/desktop/ipc/` may not import `@infrastructure` or `@frontend`.
- `renderer-no-node-builtins` / `shared-defaults-no-node-builtins` — no `fs`/`path`/`os`/`child_process`/`crypto`/`node:*` in `frontend/` or `shared/defaults/`.

Run `npm run check:architecture` to check.

## How to add a new feature

A feature usually flows: **domain → backend service → IPC router OR CLI command → frontend feature module**.

1. **Domain shape**. Add entities, value objects, ports under `domain/`. If new errors are needed, extend `DomainError` in `domain/errors.ts`.
2. **Persistence (if needed)**. Implement the repository port in `infrastructure/persistence/`. Add the table to `SQLiteSchema.ts` + a Kysely table type in `DatabaseSchema.ts` (one baseline schema — pre-release, no migrations; delete the local `domia.db` to re-create).
3. **Backend service**. Add the service in the appropriate bounded context under `backend/<context>/`. Use `@injectable()` and `@inject(TOKEN)`.
4. **DI registration**. Wire in `backend/container/ContainerBuilder.ts`.
5. **Surface**:
   - **IPC**: add a router in `apps/desktop/ipc/routers/`, register in `apps/desktop/ipc/router.ts`.
   - **CLI**: add `apps/cli/<Feature>Command.ts`, register in `apps/cli/index.ts`.
6. **Frontend (if user-facing)**: add `frontend/features/<feature>/` with components + store.
7. **Test**: add `tests/e2e/<feature>/` with real-stack tests.
8. **Record** the slice in the commit message (history lives in `git log`, not a tracked changelog).

## How to add a new app entry point (e.g. `apps/server/`)

1. `mkdir apps/server`.
2. `apps/server/index.ts`: `import 'reflect-metadata'; registerCoreServices();`.
3. Build the entry shell (Fastify, etc.). Handlers `container.resolve(...)` from DI.
4. Update `tsconfig.json` `include` if needed.
5. Update `scripts/check-architecture.mjs` if a new boundary rule applies.
6. The desktop and CLI app should require zero changes — that's the test.

## How to add a new LLM provider

1. `mkdir infrastructure/agent-runtime/<provider>`.
2. Implement `IAgentRuntime` from `@domain/ports/IAgentRuntime`.
3. Register under the `'IAgentRuntime'` token in `ContainerBuilder.registerLlm()`.
4. Add an e2e test under `tests/e2e/agent/`.

## How to add a new platform

1. Decide if it can reuse `infrastructure/playwright/` (DOM-based) or needs a new adapter family.
2. Implement `IAppDriver` and `IAppDriverProvider`.
3. Register in `ContainerBuilder.registerPlatform()` and `initializePlatformProviders()`.
4. Add the schema in `shared/contracts/platform.ts`.
5. Add fields in `frontend/lib/platformRegistry.tsx` and `frontend/features/runs/components/platform/`.
6. Update CLI `apps/cli/platformUtils.ts` to handle the new flag set.

## How to add a new tool

1. Create or extend `infrastructure/tools/catalog/<area>.tools.ts`.
2. Add a new `ActionType` enum value if needed in `domain/enums.ts`.
3. Add a typed `ToolSpec` with a Zod parameters schema and an `execute` function.
4. If the tool needs a new dependency, extend `ToolDependencies` in `infrastructure/tools/ToolSpec.ts`.
5. Add an e2e test under `tests/e2e/tools/`.

## How to add a new report format

1. Create `infrastructure/reporting/<Format>ReportGenerator.ts` implementing `IReportGenerator`.
2. Register in `ContainerBuilder.registerReporting()`.
3. Add to the report writer's `IRunReportWriter` formats union.

## Run composition (the agentic loop)

Every entry point (IPC `runRouter`, CLI `run`, workflow steps) drives `MetaAgentLoopService`, not `RunUseCase` directly. The loop treats `RunUseCase` as a primitive and gives the agent three composition powers:

- **`iterate`** (terminal tool) — end the pass, start a fresh one with clean context. The agent carries state forward via `nextGoal` and can request a different tool set via `toolCategories` (per-pass dynamic tool registration; terminal + meta categories always stay on). Each pass is its own run row, linked by `parentRunId`.
- **`spawn_subrun` / `await_subruns`** — fan out independent child agents in parallel, each in its own browser session and execution lane. Wired per run as a `SubRunCoordinator` (implements `ISubRunLauncher`); child controllers cascade pause/resume/cancel from the parent (`ExecutionController.spawnChild`).
- **`suspend`** — persist and stop until `domia resume <runId>` (pre-existing).

Composition happens at run level, not inside ADK: `SequentialAgent`/`ParallelAgent` trees were deliberately not adopted — `iterate` covers sequential, sub-runs cover parallel, and both keep every pass observable as a normal run. Don't add an ADK agent tree until a real consumer needs one.

Sub-run isolation (`backend/runs/subRunPlatform.ts`): web children get their own browser; electron-executable children launch a separate app instance on a fresh CDP port. Targets that cannot be isolated (electron-CDP attach, mobile) simply don't get the subrun tools — `supportsSubRuns` gates the coordinator, so the agent never sees tools it can't use.

The remaining unification step (roadmap slice 19): fold `backend/workflows/` step definitions into stored meta-run plans so Workflow/Skill/Run become one execution model. Workflow steps already execute through the meta loop.

## Subsystems at a glance

| Subsystem | Where | Notes |
|---|---|---|
| Agent runtime | `infrastructure/agent-runtime/adk/` | Google ADK + Gemini behind `IAgentRuntime`. `assembleAdkSession` wires the per-run pipeline; the runtime is just the event loop. Swap the folder to swap LLM provider. |
| Automation | `infrastructure/playwright/` (web + `electron/` via CDP), `infrastructure/appium/` (mobile) | All behind `IAppDriver` + `IStructuredAutomation`. Web/electron reuse the same Playwright adapter; mobile reads the native accessibility tree. |
| Tools | `infrastructure/tools/catalog/` | One `ToolSpec` shape for built-ins/plugins/skills. `buildToolCatalog` gates by platform tag **and** `AppCapabilities` (`requires`), so DOM-only tools are never offered on a DOM-less target. |
| Perception | `infrastructure/perception/` + per-driver sensors | Platform-neutral `PerceptionPipeline`; library-specific sensors live in that library's folder. |
| Persistence | `infrastructure/persistence/` | sql.js (WASM) + Kysely behind narrow repository ports. Single baseline schema (`SQLiteSchema.ts`), FK-enforced, crash-safe atomic flush, serialized writes. |
| Plugins / skills | `infrastructure/plugins/`, `infrastructure/skills/` | Plugins load extra `ToolSpec`s; skills replay recorded action sequences as `skill_*` tools. |
| Observability | `infrastructure/observability/`, `infrastructure/services/TraceService.ts` | `ILogger` (pino), domain-event → log/OTLP-span/JSONL exporters. Real run→tool span tree + per-run `trace.jsonl`. |
| CLI / desktop | `apps/cli/`, `apps/desktop/` | Both iterate the same `AsyncGenerator<RunOutput>`; desktop uses tRPC over IPC. |

## ADK conventions (`infrastructure/agent-runtime/adk/`)

- `LlmAgent` + `Runner` + `PersistentSessionService` (write-through to `<artifactsDir>/<runId>/conversation-snapshot.json`, rehydrates on cache miss — conversations survive process death), one session per `runId`.
- Instruction = static system prompt + ADK `InstructionProvider` that interpolates `{state.x}` live each turn (`buildInstructionProvider`).
- `temperature` (`DEFAULT_AGENT_TEMPERATURE`), `functionCallingConfig: AUTO`; optional Gemini `thinkingConfig` via `DOMIA_THINKING_BUDGET`.
- `RunMetricsPlugin` (ADK `BasePlugin`) records per-tool metrics + opens per-tool trace spans.
- `snapshotConversation`/`restoreConversation` persist the ADK event log for suspend/resume.
- LLM calls are wrapped (`withLlmRetry`) with the provider-neutral retry policy; planner (`AdkPlanner`) and evaluator (`AdkEvaluator`) are gated by `DOMIA_PLANNER`/`DOMIA_EVALUATOR`.

## Current state

Clean layered hexagon: pure `domain/`, real DI seam (`backend/container/`), ports/adapters with swap-by-folder, 0 circular deps, boundary + god-file rules CI-gated (`scripts/check-architecture.mjs`), coverage floor gated in `vitest.config.ts`, `Result<T,E>` across boundaries, prompts externalized to `prompts/*.md`. The agent composes its own execution (iterate passes, parallel sub-runs, suspend/resume) via `MetaAgentLoopService`; timeouts and waits are agent-controllable informants, not fixed vetoes (slow sites are covered by `tests/e2e/tools/slow-site.test.ts`). The known open levers: layer-first (not feature-first) organization — deliberately not migrated — and roadmap slice 19 (fold workflows into stored meta-run plans). Measured signals (size, coupling) live in `git log` history, not a tracked metrics file.

## Where to find things

- `CLAUDE.md` and per-area `CLAUDE.md` — agent briefs.
- `.claude/skills/` — focused skill briefs (TypeScript-strict, Playwright, the agent loop).
- `.claude/commands/` — slash commands (`/check`).

## Security posture (entry points)

- **Renderer**: `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` on both the main window and the agent WebContentsView. Preload exposes exactly two things: the tRPC bridge and `agentView.setBounds/clear` (bounds are clamped to finite non-negative integers in the main process).
- **IPC**: every parameterized tRPC procedure validates with a Zod schema from `shared/contracts`; `Result` errors are unwrapped to plain messages (`unwrap.ts`) — no stack traces or objects cross the wire. Destructive UI actions (history clear) require an explicit confirm.
- **HTTP server** (`apps/server`): read-only queries, binds `127.0.0.1` unless `DOMIA_SERVER_HOST` is set.
- **CDP port** (`remote-debugging-port` on the desktop app): required by design — the embedded web driver attaches to the agent view through it. Chromium binds it to localhost only; any local process could attach, which is the accepted trade-off for embedded mode.

## Validation before claiming done

```bash
npx tsc --noEmit            # 0 errors
npm run check:architecture  # passing
```

Or `/check` from a Claude Code session.
