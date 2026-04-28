# apps/ — Entry Points

## Rules
- **Apps contain no business logic.** Entry, routing, presentation only. Business goes in `backend/`.
- Each app folder is one entry point: `apps/desktop/`, `apps/cli/`. Future: `apps/server/`, `apps/mobile/`.
- The DI container is bootstrapped exactly once per process (`@backend/container-root` `registerCoreServices()`).
- IPC routers (`apps/desktop/ipc/`) **must not** import `@infrastructure/*`. Use backend services through DI.

## Layout
- `apps/desktop/` — Electron app.
  - `main.ts`, `preload.ts` — Electron bootstrap.
  - `ipc/router.ts` — tRPC root.
  - `ipc/routers/<feature>Router.ts` — per-feature routers.
- `apps/cli/` — Commander-based CLI.
  - `index.ts` — root command registration.
  - `<Command>.ts` — one file per top-level command (Run, History, Workflow, Settings, Inspect, Plugins).
  - `platformUtils.ts`, `reportUtils.ts` — CLI-only helpers.

## Patterns
- IPC router procedures call `container.resolve(...)` once at execution time, never at module-load time.
- Long-running operations (run, workflow run) use tRPC subscriptions over `observable<T>`.
- The CLI iterates the same `AsyncGenerator<RunOutput>` as the UI subscribes to.
- Both entry points share the same DI container, so they share singleton state per process.

## Adding a new entry point (e.g. apps/server)
1. `mkdir apps/server`.
2. `apps/server/index.ts`: import `'reflect-metadata'`, then `registerCoreServices()` from `@backend/container-root`.
3. Build the entry shell (Fastify, etc.). Mount handlers that resolve from the container.
4. The desktop and CLI app should require zero changes for a new server to work — that's the test of clean boundaries.
