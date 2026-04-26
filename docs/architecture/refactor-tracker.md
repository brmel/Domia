# Refactor Tracker

This file is updated after each completed architecture step to make drift visible.

## Current Step

| Step | Status | Goal |
|---|---|---|
| Phase 3 | Done — combined sweep complete | Top-level restructure + bounded contexts + dead code purge |

## Current Known Boundary Exceptions

These are temporary and must shrink over time.

| Rule | File | Reason | Planned Fix |
|---|---|---|---|

No active exceptions.

## Done

| Step | Outcome |
|---|---|
| Phase 0.1 | Target architecture documented and guardrail script corrected to detect real layer scope |
| Phase 1.1 | Settings and prompts Electron routers now depend on application services instead of infrastructure concretes |
| Phase 1.2 | Platform session creation now reads driver extras through the app-driver contract instead of depending on `ElectronDriver` |
| Phase 2.1 | Session lifecycle responsibilities extracted out of `RunUseCase` into `RunSessionService` |
| Phase 2.2 | Terminal-outcome evaluation, terminal `WorkflowState` transitions, checkpoint persistence, and lifecycle close extracted into `RunTerminalizationService`; mid-run failure recording routed through the same service |
| Phase 2.3 | Plan build + activation + step-outcome-to-state mapping extracted into `RunPlanCoordinator`; pause/resume/cancel gate extracted into `RunControlGateService`. `RunUseCase` no longer touches `Plan`/`PlanItem`/`nanoid`/`RunState` directly |
| Phase 2.4 | Canonical `IAgentRuntime` port defined with `AgentStepInput` / `AgentStepEvent` / `AgentStepOutcome`; old `IAgentRunner` port deleted; `AdkAgentRunner` renamed to `AdkAgentRuntime` and moved to `infrastructure/agent-runtime/adk/`; `StepExecutionKernelService` now consumes the runtime port |
| Phase 3.1a | Top-level repo restructure complete. `src/` removed. New roots: `domain/`, `backend/`, `infrastructure/`, `frontend/`, `shared/`, `apps/desktop/`, `apps/cli/`. Path aliases: `@domain`, `@backend`, `@infrastructure`, `@frontend`, `@shared`, `@apps`. All build configs + architecture script updated |
| Phase 3.1c | Backend regrouped by bounded context: `backend/runs/` (RunUseCase + RunLifecycleManager + RunSession + RunPlanCoordinator + RunControlGate + RunTerminalization + RunDurability + RunExecutionLane + RunBudgetPolicy + StepExecutionKernel), `backend/workflows/` (5 services), `backend/settings/`, `backend/prompts/`, `backend/platform/` (Capability + Session + Factory + URL utils), `backend/policy/` (RuntimeReadiness). Old `services/`, `use-cases/`, `services/execution/`, `services/hardening/`, `services/workflow/` directories deleted |
| Phase 3.1d | Aggressive sweep: deleted half-built UI sections (Skills/Governance/Observability tabs + `AppSectionPlaceholder`); removed Android/iOS platform stubs end-to-end (UI components, registry entries, Zod schemas, domain types, CLI flags, capability matrix rows, `platformUrlUtils` cases); deleted dead drivers (`ElectronCDPConnector`, `ElectronProcessLauncher`); deleted dead `browserWsEndpoint`/`browser_ready` end-to-end (port, drivers, adapter, DTO, store, workflow event handler); stripped JSDoc fluff and dead constants (`SQLITE_MIGRATION_IDS`, `getSqlJs`, `asPluginName`, `analyzeLog`, `CDP_DEFAULT_HOST`, `DEFAULT_APPIUM_URL`); cleaned `domain/value-objects/index.ts` barrel; stripped 30+ unused `export` keywords on internal types; pruned dead deps (`@testing-library/*`, `@types/uuid`, `@vitest/coverage-v8`, `jsdom`, all `@google-cloud/*` and most `@opentelemetry/*` optionals); added missing `@google/genai` dep |
| Phase 6.1 | Deleted `tests/unit/` (33 mocked unit tests), `tests/component/`, `tests/helpers/`, redundant `vitest.component.config.ts` and unit `vitest.config.ts` (kept the integration one). Created `tests/support/tempDb.ts` (single helper) for e2e DB scaffolding. Removed dead `scripts/readiness-gate.mjs`, `scripts/check-code-markers.mjs`, `tests/run-all-tests.ts` |
| Phase 3.1b | Frontend feature-sliced. New layout: `frontend/{app,api,lib,ui,features/{runs,workflows,plugins}}/`. Components grouped under their owning feature; cross-feature primitives in `ui/`; tRPC client in `api/`; utilities in `lib/`. The flat `components/`, `stores/`, `utils/`, `config/` grab-bags are gone |
| Phase 4.1 | Simplified agent runtime port: replaced pass/fail/max_actions/no_terminal_call/error/code/reason model with `AgentOutcome = done\|stopped\|error`; `done` carries `AgentOutput { summary, verdict?, value? }`. Replaced 2 terminal tools (`pass`,`fail`) with one `finish` tool; replaced `ActionType.PASS`/`ActionType.FAIL` with `ActionType.FINISH`. Deleted `AgentLoopGuard`, `DEFAULT_LOOP_GUARD_THRESHOLD`, and the loop-warning `beforeToolCallback` plumbing. Added `backend/runs/outcomes.ts` with `isOutcomeSuccessful`/`summarizeOutcome`. Updated `RunPlanCoordinator`, `RunTerminalizationService`, `RunControlGateService`, `RunUseCase`, `StepExecutionKernelService`, `AdkAgentRuntime`, frontend `RunActivityLog`, all integration tests |
| Phase 6.2 | Reshaped `tests/integration/` into `tests/e2e/{agent,workflow,persistence,tools,cli}/`. Renamed files from `*.integration.test.ts` to `*.test.ts`. Updated `vitest.config.ts` to scan `tests/e2e/**/*.test.ts`. CLI suite moved to `tests/e2e/cli/` with fixture paths updated; `package.json` `test:cli` script updated; tests README rewritten to describe e2e-only structure |
| Phase 5.1 | Domain events + in-process bus added. `domain/events/index.ts` declares `DomainEvents` (run.started/completed/failed/cancelled/state_updated, step.persisted, agent.outcome, plugin.loaded, config.changed). `IEventBus` port in `domain/ports/`. `EventBus` impl in `backend/events/EventBus.ts` backed by `mitt` (3 KB, 8.7k stars). `RunLifecycleManager` and `PluginRegistry` emit. New `EventLogger` (infrastructure/observability/) subscribes and routes to `pino` logger as the default subscriber |
| Phase 5.3 | All Zod schemas moved to `shared/contracts/{run,platform,workflow,config}.ts` + barrel `index.ts`. Old `shared/validation.ts`, `shared/validation/`, `shared/config-types.ts` deleted. Frontend hooks, IPC routers, and CLI argv parsers all import from one path. URL transform extracted to a free `normalizeWebUrl` so schemas don't change types |
| Phase 5.6 | Error catalog hardened: `DomainError` base class made `export`able; new `ReadinessError`, `BudgetExceededError`, `SessionError` classes wired in. `RunSessionService` throws `SessionError`, `RunUseCase` yields `ReadinessError`, `StepExecutionKernelService` throws `BudgetExceededError`. `RunLifecycleManager.initializeRun` returns `Result<RunId, ValidationError \| PersistenceError>` instead of `Result<RunId, Error>` |
| Phase 5.2 | Lightweight CQRS: `backend/runs/RunQueries.ts` + `backend/workflows/WorkflowQueries.ts` consolidate read paths. `apps/desktop/ipc/routers/historyRouter.ts` no longer touches `IPersistenceAdapter` directly — calls `RunQueries`. Both query services registered in `ContainerBuilder.registerUseCases()` |
| Phase 5.5 | Domain plugin port introduced: `domain/ports/IPlugin.ts` defines `PluginName`, `PluginCapabilities`, `IPlugin`. `infrastructure/plugins/PluginManifest.ts` re-exports `PluginName` from domain |
| Phase 5.7 | `ConsoleLogger` rewritten on top of `pino` (14k stars) — same `ILogger` interface, ~40 lines instead of 60. Custom format-truncation logic deleted. `EventLogger` subscribes to the bus and routes domain events through pino as structured logs. Custom log-context-truncation default (`MAX_LOG_CONTEXT_LENGTH`) deleted |
| Cleanup | `DEFAULT_LOOP_GUARD_THRESHOLD` removed (loop guard was deleted earlier). `MAX_LOG_CONTEXT_LENGTH` removed. Schema URL transform replaced by free function `normalizeWebUrl`. Architecture guardrails still pass with no exceptions |
| Phase A (UI/CLI parity) | Closed five drift gaps: (1) `PluginsAppService` + `pluginsRouter` + `domain/ports/IPluginRegistry` + new `PluginsCommand` CLI (`domia plugins list/enable/disable`). (2) New `RunReportingService` + `domain/ports/IRunReportWriter` + `run.generateReport` tRPC mutation + JUnit/HTML buttons in `RunActivityLog` after a run completes. (3) Recording toggle field added to `RunForm` flowing through `RunOptions`. (4) Renderer `pino` logger at `frontend/lib/logger.ts`. (5) Backend boundary preserved — added domain ports for plugin registry and report writer to keep routers/backend off `@infrastructure/...` |
| Phase B (e2e test surface) | Added `tests/support/llmReplay.ts` (sha256-keyed JSON replay store under `tests/fixtures/llm-recordings/`). Added fixture Electron app at `tests/fixtures/electron-app/` (main.cjs, index.html, package.json) for future driver tests. Added fixture plugin at `tests/fixtures/plugins/sample-plugin/` and `tests/e2e/plugins/plugin-loader.test.ts` covering load + collision rejection. Added DOM-tools fixture page + `tests/e2e/tools/dom-tools.test.ts` exercising real Playwright extract + navigation against a localhost fixture server |
| Phase C (agent freedom) | Added `RunState.FINISHED` and `Run.finish()` factory; `RunStatus` discriminated union now includes `{ type: 'finished'; summary; value? }`. `RunLifecycleManager.finalizeRun` now takes the full `AgentOutcome` and routes to `Run.pass` / `Run.fail` / `Run.finish` based on `verdict`. `RunTerminalizationService` passes `outcome` through. New `RunIntent = 'task'\|'assertion'\|'extraction'` on `RunInput`. Rewrote `DEFAULT_SYSTEM_INSTRUCTION` + `DEFAULT_STEP_GOAL` + shell rule prompts: removed all "call pass / call fail" framing, added explicit "WHEN TO CALL 'finish'" section explaining `verdict` is optional and `value` is for extraction. Deleted `loopWarning` prompt key + default. CLI banner changed from "Mission Accomplished/Failed" to "Finished/Failed" |

## Validation

`tsc --noEmit` — **0 errors**.
`npm run check:architecture` — passes.

## Next Slice

| Next | Outcome |
|---|---|
| Phase 5.4 | Configuration slicing: split `DomiaConfig` blob into per-context schemas (`AiConfig`, `PluginsConfig`, `PathsConfig`, `RuntimeConfig`), each Zod-validated at startup; consumers receive only their slice via DI |
| Phase 5.5b | Plugin sandboxing: load `.js` plugin manifests inside Node `vm.Context` so plugin code can't reach into the host process; capability check against the declared `PluginCapabilities` |
| Phase 5.7b | OpenTelemetry exporter: wire `@opentelemetry/exporter-trace-otlp-http` (already an optional dep) as a second `EventLogger`-style subscriber when `DOMIA_OTEL_ENDPOINT` is set |
| Phase 7 | apps/server entrypoint: validate the layered architecture by adding a Fastify HTTP adapter consuming the same backend services |
| Phase B-cont | Wire the LLM replay support into `tests/e2e/agent/vision-multimodal.test.ts` and add a real-browser DOM-tools test for click + type once the runtime + tool deps factory is exposed |
| Phase A-cont | Expand `SettingsSidebar` to render every key in `DomiaConfig` (paths, reporting defaults, readiness mode/profile) instead of only AI block + plugin toggles |