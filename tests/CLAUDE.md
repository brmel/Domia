# tests/ — End-to-End Only

## Rules
- **No mocked unit tests.** We test against real DB, real browser, real LLM (replay), real plugin loader.
- Mocks are only allowed for the LLM (via `tests/support/llmReplay.ts`) and `IEventBus` no-op stubs in tests that don't need event flow.
- Each test file ends in `.test.ts` and lives under `tests/e2e/<area>/`.
- Test fixtures live under `tests/fixtures/`. Test scaffolding lives under `tests/support/`.

## Layout
- `tests/e2e/agent/` — full agent runs (Gemini + Playwright).
- `tests/e2e/workflow/` — workflow orchestrator with real persistence.
- `tests/e2e/persistence/` — SQLite migrations + repositories.
- `tests/e2e/tools/` — tool catalog against fixture pages.
- `tests/e2e/plugins/` — plugin loader.
- `tests/e2e/cli/` — **deterministic** CLI smoke (`*.test.ts`, in the vitest suite: `--help` + `history list`, no LLM) plus the **live** LLM-driven scenarios (`*-test.ts`, run on demand via `npm run test:cli`) and their fixtures/helpers.
- `tests/e2e/desktop/` — tRPC IPC `appRouter` wiring smoke.
- `tests/support/` — `tempDb.ts`, `llmReplay.ts`.
- `tests/fixtures/` — static HTML, recorded LLM responses, sample plugins, fixture Electron app.

## Patterns
- DB tests: `createInMemoryDb()` from `@/tests/support/tempDb`.
- Fixture HTML: `startFixtureServer(dir)` from `tests/e2e/cli/helpers/web-fixture-server.ts`.
- Tool/automation cases: `createWebHarness(dir)` / `createElectronHarness(dir)` from `tests/support/toolHarness.ts` — one call returns `{ automation, baseUrl, seedRefs, close }` so a new web *or* electron case is a few lines (see `tools/dom-tools`, `tools/electron-tools`).
- LLM replay: `LlmReplay` from `tests/support/llmReplay.ts`.
- Construct infrastructure adapters directly with `new` — no DI in tests. Tests should be transparent about what they wire.

## Adding an e2e test
1. Pick the right area folder.
2. Construct the deps directly with `new`.
3. Use `beforeAll` for setup that can be shared, `afterAll` for cleanup.
4. Assert on user-visible behavior: the persisted Run row, the emitted event stream, the generated report file.
5. Never assert on internal method calls or counts.
