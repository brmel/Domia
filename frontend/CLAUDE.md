# frontend/ — React Renderer

## Rules
- **No Node builtins** (`fs`, `path`, `os`, `child_process`, `crypto`, `node:*`). CI-enforced.
- **No infrastructure imports.** Only domain types, shared contracts/types, backend DTO types, frontend internals.
- Feature-sliced: each feature lives in `frontend/features/<feature>/`.
- UI primitives in `@frontend/ui/`. Cross-feature utilities in `@frontend/lib/`.
- Single tRPC client in `@frontend/api/trpc`.

## Layout
- `app/` — shell. App.tsx, main.tsx, providers.
- `api/` — tRPC client + AppRouter type.
- `ui/` — design system primitives (Button, FormInput, SegmentedControl, etc.).
- `lib/` — utilities (cn, formatters, registries, agentStateUtils, logger).
- `features/<feature>/` — per-feature components, store, hooks.
  - `features/runs/`
  - `features/workflows/`
  - `features/plugins/`

## Patterns
- State per feature in `features/<feature>/store.ts` using Zustand.
- tRPC subscriptions consumed in custom hooks (`useRunPanel`; workflows split across `useWorkflowDefinitions` / `useWorkflowEditor` / `useWorkflowRuns` / `useWorkflowEventFeed`).
- Components import `cn` from `@frontend/lib/cn` for class merging.
- Logging via `@frontend/lib/logger` (browser-safe pino).

## Adding a feature module
1. `mkdir frontend/features/<feature>/components`.
2. Add `store.ts` (Zustand) if local state is needed.
3. Add components under `components/`.
4. Wire into `frontend/app/App.tsx` (a new tab, a new route, etc.).
5. The corresponding tRPC router + backend service must already exist before this step.

## Adding a UI primitive
1. Add to `frontend/ui/<Primitive>.tsx`.
2. Use Tailwind utility classes via `cn()`.
3. Export typed props.
4. Use throughout features. Do not duplicate primitives in feature folders.
