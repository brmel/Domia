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
| Runs | `backend/runs/` | Single-prompt agent run lifecycle |
| Workflows | `backend/workflows/` | Multi-step orchestration over runs |
| Settings | `backend/settings/` | Config facade |
| Prompts | `backend/prompts/` | Prompt override facade |
| Plugins | `backend/plugins/` | Plugin enable/disable + listing |
| Platform | `backend/platform/` | Platform negotiation + session lifecycle |
| Policy | `backend/policy/` | Cross-context policy gates (readiness today) |

Cross-context imports are allowed (e.g. `WorkflowStepRunnerService` calls `RunUseCase`), but only top-level surfaces — never reach into another context's private files.

## CI guards (`scripts/check-architecture.mjs`)

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
2. **Persistence (if needed)**. Implement the new repository port in `infrastructure/persistence/`. Add a Kysely table type. Add a migration.
3. **Backend service**. Add the service in the appropriate bounded context under `backend/<context>/`. Use `@injectable()` and `@inject(TOKEN)`.
4. **DI registration**. Wire in `backend/container/ContainerBuilder.ts`.
5. **Surface**:
   - **IPC**: add a router in `apps/desktop/ipc/routers/`, register in `apps/desktop/ipc/router.ts`.
   - **CLI**: add `apps/cli/<Feature>Command.ts`, register in `apps/cli/index.ts`.
6. **Frontend (if user-facing)**: add `frontend/features/<feature>/` with components + store.
7. **Test**: add `tests/e2e/<feature>/` with real-stack tests.
8. **Record** the slice in the commit; update `docs/architecture/audit.md` §Next if it shifts the roadmap.

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

## Where to find things

- `docs/architecture/audit.md` — measured current-state signals (metrics, coupling, god files) + next/roadmap.
- `docs/architecture/subsystems.md` — per-subsystem audit: multi-app, agents/ADK, persistence/history, CLI/desktop, logging, testing.
- `docs/architecture/tool-system.md` — tools/plugins/skills/ADK wiring (cross-app vs app-specific) UML.
- `docs/architecture/feature-first-migration.md` — the feature-slice migration plan + decision.
- `CLAUDE.md` and per-area `CLAUDE.md` — agent briefs.
- `.claude/skills/` — focused skill briefs for stack tech.
- `.claude/commands/` — slash commands.

## Validation before claiming done

```bash
npx tsc --noEmit            # 0 errors
npm run check:architecture  # passing
```

Or `/check` from a Claude Code session.
