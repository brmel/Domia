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

| Area | Target Module |
|---|---|
| Frontend | `src/presentation/features/*`, `src/presentation/ui/*` |
| App/API | `src/application/commands/*`, `src/application/queries/*`, `src/application/services/*` |
| Domain | `src/domain/*` |
| Agent Runtime | `src/infrastructure/agent-runtime/*` |
| Platform Adapters | `src/infrastructure/platforms/web/*`, `src/infrastructure/platforms/electron/*`, `src/infrastructure/platforms/mobile/*` |
| Infra Services | `src/infrastructure/persistence/*`, `src/infrastructure/reporting/*`, `src/infrastructure/config/*`, `src/infrastructure/storage/*` |
| Entrypoints | `electron/*`, `src/cli/*` |

## Non-Negotiable Rules

- `src/domain/**` imports only domain and shared pure utilities.
- `src/application/**` imports domain and application code, never infrastructure or presentation.
- `src/presentation/**` imports presentation, application DTOs/clients, and shared UI-safe types only.
- Entrypoints (`electron/**`, `src/cli/**`) talk to application facades, not infrastructure internals.
- Provider-specific code belongs behind runtime adapters.
- Platform-specific code belongs behind platform adapters.

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