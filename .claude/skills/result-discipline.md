---
name: result-discipline
description: When to throw, when to return Result, the error catalog. Layer-by-layer rules.
---

# Result Discipline

We use `neverthrow` for typed errors. Discipline matters more than the library.

## The rule per layer

| Layer | Idiom |
|---|---|
| Domain operations | Return `Result<T, DomainError>` |
| Application use cases | Return `Result<T, AppError>` (where AppError extends DomainError) |
| Infrastructure adapters | Throw at the edge (with library), but ports return `Result` |
| Routers / CLI | Catch `Result`, translate to HTTP / IPC / exit code |

## The error catalog

In `domain/errors.ts`:

- `DomainError` — abstract base. Every error has `code: string` and optional `cause: unknown`.
- `ValidationError`, `PersistenceError`, `WorkflowError`, `NavigationError`, `InteractionError`, `SnapshotError`, `ReadinessError`, `BudgetExceededError`, `SessionError`.

To add a new error class: extend `DomainError`, add a unique `code`, add it to the appropriate layer's union return type.

## Return shape examples

```ts
// Domain: pure validator
function parseUrl(s: string): Result<Url, ValidationError> {
    const trimmed = s.trim();
    if (!trimmed) return err(new ValidationError('URL is empty', 'url'));
    return ok(trimmed as Url);
}

// Application: a typed union return
async initializeRun(...): Promise<Result<RunId, ValidationError | PersistenceError>> { ... }

// Infrastructure adapter port shape
saveRun(run: Run): ResultAsync<void, PersistenceError>;
```

## Throwing — when allowed

- Inside an infrastructure adapter, when calling a library that throws (e.g. Playwright). Catch at the adapter boundary and convert to a `Result`.
- Inside a route handler, throwing is fine — tRPC will translate it to an error. But prefer to catch `Result.error` and emit a typed code.
- **Never** throw from a domain function.

## Common patterns

```ts
// Map a Result to a different success shape
const idResult = await this.persistence.saveRun(run).map(() => id);

// Map an error to a richer shape
.mapErr((cause) => new PersistenceError(`Failed to save run: ${cause.message}`, cause))

// Combine multiple Results
Result.combine([a, b, c])

// Early-return on Err
const r = await this.persistence.getRun(id);
if (r.isErr()) return err(r.error);
const run = r.value;
```

## The `cancelOutcome` / `AgentOutcome.error` boundary

When the agent runtime fails, it returns `{ kind: 'error', cause: Error }`. The cause is an `Error`, not a `Result`. The kernel then synthesizes whichever final state is appropriate. **This is an exception** to the rule — we use the AgentOutcome union as the return type rather than a Result, because the outcome IS the success-or-failure shape.
