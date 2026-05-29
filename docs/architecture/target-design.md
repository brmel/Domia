# Target Design

This document is the source of truth for the Domia redesign.

The goal is a production-ready platform that is simple, modular, provider-agnostic, and small enough to evolve safely. Backward compatibility is not a constraint during the redesign.

## Design Principles

- Prefer mature industry tooling over custom orchestration code.
- Keep product-specific logic custom; outsource generic runtime plumbing.
- Make boundaries obvious in code and enforce them in CI.
- Remove speculative features and unfinished surfaces until they are real.
- Reduce code volume whenever an abstraction does not clearly earn its keep.

## Target Layers

| Layer | Owns | Must Not Own |
|---|---|---|
| Frontend | Views, user input, local UI state, live status rendering | Driver logic, persistence logic, provider logic |
| App/API | Commands, queries, use-case orchestration, DTOs | UI components, SDK-specific runtime details |
| Domain | Policies, invariants, value objects, state transitions | Electron, Playwright, ADK, React, SQLite |
| Agent Runtime | Agent loop adapter, tool registration, model-specific translation | Business workflow rules, UI concerns |
| Platform Adapters | Web/Electron/Mobile automation integration | App orchestration, product policy |
| Infrastructure | Persistence, config, storage, reporting, logging | UI and domain policy |
| App Entrypoints | Electron, CLI, future HTTP/server adapters | Concrete business logic |

## Target Module Map

> Updated 2026-05-29: the redesign landed; the `src/`-prefixed paths below were
> the pre-refactor plan and have been replaced with the real layer directories.

| Area | Module |
|---|---|
| Frontend | `frontend/features/*`, `frontend/ui/*` |
| App/API | `backend/runs/*`, `backend/workflows/*`, `backend/<context>/*`, `backend/dto.ts` |
| Domain | `domain/*` |
| Agent Runtime | `infrastructure/agent-runtime/adk/*` |
| Platform Adapters | `infrastructure/playwright/*`, `infrastructure/playwright/electron/*`, `infrastructure/appium/*` |
| Infra Services | `infrastructure/persistence/*`, `infrastructure/reporting/*`, `infrastructure/prompts/*`, `infrastructure/observability/*` (config + storage live in `infrastructure/`) |
| Composition root | `backend/container/*` (the only place that wires infrastructure to ports) |
| Entrypoints | `apps/desktop/*`, `apps/cli/*` |

## Non-Negotiable Rules

- `domain/**` imports only domain and shared pure types/constants.
- `backend/**` imports domain and backend code, never `@infrastructure`/`@frontend`/`@apps` — the sole exception is `backend/container/`.
- `frontend/**` imports frontend, backend DTOs/clients, and shared UI-safe types only; never `@infrastructure` or Node builtins.
- Entrypoints (`apps/**`) talk to backend facades through the DI container, not infrastructure internals (`apps/desktop/ipc/` may not import `@infrastructure`).
- Provider-specific code belongs behind runtime adapters.
- Platform-specific code belongs behind platform adapters.
- Enforcement is CI-gated by `scripts/check-architecture.mjs`.

## Simplification Targets

- Replace custom agent-loop plumbing with the runtime SDK wherever possible.
- Shrink the run orchestrator into small coordinators.
- Treat workflows as sequencing over runs, not a second runtime engine.
- Keep only high-value report types and policy systems.
- Hide or remove unfinished product sections until implemented.

## Current Refactor Order

1. Freeze target architecture and drift guardrails.
2. Introduce application facades for runs, workflows, settings, history, prompts.
3. Split the run/orchestrator core into smaller coordinators.
4. Isolate the agent runtime into a true adapter boundary.
5. Modularize platform adapters and tool packs.
6. Simplify workflow execution to composition over runs.
7. Remove speculative UI and dead abstractions.