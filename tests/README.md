# Test Structure

End-to-end tests only. No mocked unit tests.

- `tests/e2e/agent/**` — full agent runs against a real browser + LLM (record/replay).
- `tests/e2e/workflow/**` — workflow orchestration through real services + persistence.
- `tests/e2e/persistence/**` — SQLite migrations, repositories, report writer.
- `tests/e2e/tools/**` — tool catalog (recording, polling, shell) against fixture pages.
- `tests/e2e/cli/**` — CLI scenarios spawned as real subprocesses.
- `tests/support/**` — test scaffolding (temp DB, fixture servers, LLM replay).
- `tests/fixtures/**` — static HTML, recorded LLM responses, sample plugins.

Run with `npm test`. CLI suite via `npm run test:cli`.

Use path aliases (`@domain`, `@backend`, `@infrastructure`, `@frontend`, `@shared`, `@apps`).
