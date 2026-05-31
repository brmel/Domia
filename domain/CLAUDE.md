# domain/ — Pure Business Core

## Rules
- **No I/O.** No file system, no network, no DB, no Date.now() inside pure functions (pass time as a parameter where it matters).
- **No imports** from `@backend`, `@infrastructure`, `@frontend`, `@apps`. CI-enforced.
- Imports from `@shared/contracts` and `@shared/defaults` are allowed for types and constants only.
- Use **typed const** over `enum` for string literal sets (see `CheckpointReason.ts`).
- All branded IDs go through factories (`RunIdFactory`, `UrlFactory`).

## Layout
- `entities/` — Run, Workflow, Plan. Stateful aggregates with factory functions, no methods that hide state.
- `value-objects/` — immutable types. `WorkflowState`, `AgentAction`, branded IDs, etc.
- `events/` — `DomainEvents` map. New events = new entry in the map + handler subscription downstream.
- `errors.ts` — error catalog. New error class extends `DomainError` with a unique `code`.
- `enums.ts` — actual `enum` types (currently `ActionType`, `RunState`, `LogLevel`).
- `ports/` — interfaces only (impls live in `infrastructure/`), grouped by concern: `ports/{agent,automation,perception,persistence,reporting,plugins,platform}/`. The `ports/index.ts` barrel re-exports every subfolder, so consumers import from `@domain/ports` (barrel) or `@domain/ports/<group>/IXxx` (deep).
- `types/` — DTOs and shared types not tied to a single port.

## Adding a new aggregate
1. Add the entity in `entities/`.
2. Add the value objects it needs.
3. Add the port for its repository in `ports/persistence/I<Name>Repository.ts`.
4. Implement in `infrastructure/persistence/`.

## Adding a new domain event
1. Add the entry to `events/index.ts`'s `DomainEvents` map.
2. Emit it from the appropriate backend service.
3. Subscribe in `infrastructure/observability/EventLogger.ts` if it should be logged.
