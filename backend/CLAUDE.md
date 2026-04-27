# backend/ — Application Orchestration

## Rules
- **Imports allowed**: `@domain`, `@shared`, internal `backend/*`. Never `@infrastructure`, `@frontend`, `@apps`.
- **The only exception** is `backend/container/` — the composition root. It registers infrastructure adapters under domain ports.
- One bounded context per top-level folder (`runs/`, `workflows/`, `settings/`, `prompts/`, `plugins/`, `platform/`, `policy/`).
- Bounded contexts may import from each other (e.g. `WorkflowStepRunnerService` uses `RunUseCase`), but only top-level types — never reach into another context's private files.

## Layout
- `runs/` — agent run lifecycle.
- `workflows/` — multi-step workflow orchestration.
- `settings/`, `prompts/`, `plugins/` — small facades over their corresponding infrastructure services.
- `platform/` — platform negotiation + session management.
- `policy/` — cross-context decision services (readiness gate today).
- `events/` — `EventBus` impl backed by `mitt`.
- `container/` — DI registrations (the only place that may import infrastructure).
- `dto.ts` — wire shapes (`RunInput`, `RunOutput`).
- `ExecutionController.ts` — pause/resume/cancel signal bus.

## Patterns
- Services are `@injectable()` and receive ports via `@inject('PortToken')`.
- Use `Result<T, DomainError>` for return types that can fail. Throw only inside infrastructure adapter wrappers.
- Async generators (`AsyncGenerator<RunOutput, void>`) are how we stream events to UI/CLI.

## Adding a service to a bounded context
1. Create the service in the right context folder.
2. Add the `@injectable()` decorator and constructor `@inject` declarations.
3. Register in `container/ContainerBuilder.ts` under the right `register*()` method.
4. Inject via the port token, never the concrete class.

## Adding a new bounded context
1. Create `backend/<context>/`.
2. Add a `<Context>AppService.ts` as the facade.
3. Add a `<Context>Queries.ts` for read paths if needed.
4. Register in `ContainerBuilder.registerUseCases()`.
5. Add a tRPC router in `apps/desktop/ipc/routers/<context>Router.ts`.
6. Add a CLI command in `apps/cli/<Context>Command.ts`.
