# @domia/ui — Interface Spec

**Purpose.** React renderer, feature-sliced, consuming only the `DomiaApi` type +
a transport client. Zero Node/OS access (sandboxed renderer, V1 posture).

**Kind.** Consumer — exempt from the module lifecycle.

---

## Contract with the rest of the system

- Imports **only** `DomiaApi` (contracts type) + the transport client binding.
  Never a domain package (rule D3).
- Renders from read models + event streams; no state trace doesn't already know.
- Screenshot/video `src` = `domia-artifact://<sha256>` (desktop protocol, F4) —
  refs in, streams out, never base64 over IPC.

## Feature slices (`features/*`)

| Slice | Screens | Api used |
|---|---|---|
| `cases` | list, editor (target, MCP mounts, tool policy), validation panel, "Capture login" | `cases.*` |
| `runs` | launcher (case + request + options), run list, **LIVE RUN VIEW** | `runs.*`, `plans.watch` |
| `trace` | timeline, span tree, screenshot filmstrip, video player | `traces.*` |
| `memory` | per-case memory cards (browse/edit) | `memories.*` |
| `schedules` | cron list, enable/disable | `schedules.*` |
| `settings` | personas, providers, model overrides, keys | `settings.*`, `agents.*` |

## LIVE RUN VIEW (the flagship, `features/runs/live/`)

| Component | Source |
|---|---|
| `ActivityLane` | `runs.watch` — agent turns (thoughts) + tool calls with before/after screenshots (artifact refs) |
| `PlanBoard` | `plans.watch` — items tick pending→active→done live |
| `PromptCards` | `run.waiting_user` events → question / approval / **takeover** cards → `runs.answer` |
| `CostMeter` | cumulative `TokenUsage` from turn events |
| `SignalChips` | `run.signal` — budget/duration/plan_stale/idle |

## Internal structure

| Area | Files | Role |
|---|---|---|
| shell | `app/{shell.tsx, routes.tsx, theme.ts}` | layout, routing, light/dark |
| client | `api/client.ts` | binds `DomiaApi` over tRPC-IPC; exposes typed hooks |
| state | `api/queries.ts` `features/*/store.ts` | TanStack Query (server state) + per-run zustand slices (live streams) |
| primitives | `ui/*` | buttons, cards, tables, filmstrip |

## Design notes

- Live view reduces streams into a per-run zustand slice; the trace is the single
  source of truth, so replay tests and the UI show identical data.
- `watch` sync-first (F5) means opening a running view is never blank.

## File manifest (abridged)

```
ui/
  package.json  tsconfig.json  index.html
  src/
    app/{shell.tsx, routes.tsx, theme.ts}
    api/{client.ts, queries.ts}
    features/cases/*  features/runs/{launcher.tsx, list.tsx, live/*}
    features/trace/*  features/memory/*  features/schedules/*  features/settings/*
    ui/*
    main.tsx
```
