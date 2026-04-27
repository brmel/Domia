# infrastructure/ — Adapters

## Rules
- Each file or sub-folder is the **implementation of a domain port**. If it doesn't implement a port, ask why it's here.
- May import from `@domain`, `@shared`, internal `infrastructure/*`. **Never** `@backend`, `@frontend`, `@apps`.
- The composition root (`backend/container/`) is the only place that imports from us.

## Sub-folder = unit of replacement

A whole sub-folder represents one swappable implementation:

- `infrastructure/playwright/` — all Playwright-specific code. Replace this folder = swap browser automation.
- `infrastructure/agent-runtime/adk/` — the Google ADK agent runtime. Replace = swap LLM provider.
- `infrastructure/persistence/` — SQLite + sql.js. Replace = swap DB.
- `infrastructure/reporting/` — JUnit + HTML report generators.
- `infrastructure/perception/` — platform-neutral perception orchestration (`PerceptionPipeline`, `VisionSensor`). Sensors that touch a specific browser library go in that library's folder (e.g. `playwright/perception/AriaSensor.ts`).

## Layout
- `agent-runtime/<provider>/` — `IAgentRuntime` impls.
- `playwright/` — DOM platform. Includes `electron/` sub-folder for Playwright-via-CDP.
- `drivers/` — `IAppDriverFactory` dispatcher (platform-neutral).
- `persistence/` — `IPersistenceAdapter` impl.
- `perception/` — orchestration only.
- `tools/catalog/` — built-in tool implementations.
- `plugins/` — plugin loader + registry.
- `prompts/` — `PromptService` (loads from repo `prompts/` dir).
- `reporting/` — report generators.
- `services/` — generic adapters (TraceService).
- `shell/` — shell executor + policy.
- `llm/` — model config resolution.
- `observability/` — `EventLogger` (bus subscriber).
- `ConfigService.ts`, `ConsoleLogger.ts`, `FileSystemStorage.ts`, `ActionRecordingService.ts`.

## Adding a new LLM provider
1. Create `infrastructure/agent-runtime/<provider>/<Provider>AgentRuntime.ts`.
2. Implement `IAgentRuntime` from `@domain/ports/IAgentRuntime`.
3. Register under the `'IAgentRuntime'` token in `ContainerBuilder.registerLlm()`.

## Adding a new platform
1. Create `infrastructure/<platform>/` (or extend existing `playwright/`).
2. Implement `IAppDriver` and `IAppDriverProvider`.
3. Register the provider in `ContainerBuilder.registerPlatform()` and `initializePlatformProviders()`.
4. Add the platform schema in `shared/contracts/platform.ts`.

## Adding a new tool
1. Create or extend a file in `infrastructure/tools/catalog/<area>.tools.ts`.
2. Add a new `ActionType` enum value if needed.
3. Add a typed `ToolSpec` with a Zod parameters schema.
4. Wire any new dependency through `ToolDependencies` in `ToolSpec.ts`.
