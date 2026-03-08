# Test Structure

- `tests/unit/**`: isolated unit tests for domain/application/infrastructure/shared modules.
- `tests/integration/**`: multi-component integration tests (runtime orchestration, service collaboration).
- `tests/cli/**`: CLI scenario and feature tests.

Guidelines:
- Keep production code in `src/**` only.
- Keep new tests under `tests/**`.
- Prefer path aliases (`@application`, `@domain`, `@shared`, etc.) over brittle relative imports.
