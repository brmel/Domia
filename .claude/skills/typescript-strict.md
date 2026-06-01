---
name: typescript-strict
description: TypeScript conventions for this repo — strict flags, typed const over enum, branded IDs, exactOptionalPropertyTypes, noUncheckedIndexedAccess, Result-over-throw, the error catalog, and DI tokens.
---

# TypeScript — Strict Conventions

Enabled and load-bearing: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`, `noUnusedLocals`, `noUnusedParameters`.

## Typed const over enum

```ts
export const CheckpointReason = { RunInitialized: 'run_initialized', PlanReady: 'plan_ready' } as const;
export type CheckpointReason = typeof CheckpointReason[keyof typeof CheckpointReason];
```
Tree-shakes, keeps the string literal flowing through generics, stays readable when DB-persisted. Use real `enum` only for numeric mappings (e.g. `LogLevel`).

## Branded IDs

```ts
declare const __runIdBrand: unique symbol;
export type RunId = string & { readonly [__runIdBrand]: void };
```
Construct via a validating factory (`RunIdFactory.create()`). Never `'foo' as RunId`.

## Result over throw (across layer boundaries)

`neverthrow`. Discipline matters more than the library.

| Layer | Idiom |
|---|---|
| Domain operations | return `Result<T, DomainError>` — **never throw** |
| Application use cases | return `Result<T, AppError>` (AppError extends DomainError) |
| Infrastructure adapters | may throw at the library edge, but the **port** returns `Result` |
| Routers / CLI | catch the `Result`, translate to IPC/HTTP/exit code |

```ts
return await this.persistence.saveRun(run)
    .map(() => runId)
    .mapErr((e) => new PersistenceError(`Failed to save run: ${e.message}`, e));
// early-return: const r = await get(id); if (r.isErr()) return err(r.error); const v = r.value;
// combine:      Result.combine([a, b, c])
```

**Error catalog** (`domain/errors.ts`): `DomainError` (abstract; `code` + optional `cause`) → `ValidationError`, `PersistenceError`, `WorkflowError`, `NavigationError`, `InteractionError`, `SnapshotError`, `SessionError`, and the `LlmError` family (`LlmRateLimitError`, `LlmServerError`, `LlmAuthError`, `LlmBadRequestError`, each with a `retryable` flag). New error = extend `DomainError`, unique `code`, add to the relevant return union.

**Exception:** the agent runtime returns the `AgentOutcome` union (`done | stopped | error`) rather than a `Result` — the outcome *is* the success/failure shape.

## exactOptionalPropertyTypes

`{ x?: string }` ≠ `{ x: string | undefined }`. You cannot assign `undefined` to `x?` — omit it via the spread idiom:
```ts
{ platform: 'web', url, ...(windowTitle ? { windowTitle } : {}) }
```

## noUncheckedIndexedAccess

`array[0]` is `T | undefined`. Use `array[0]!` only when non-emptiness is guaranteed; otherwise narrow (`const first = array[0]; if (!first) return;`). `Array.find` returns `T | undefined`.

## DI tokens (tsyringe)

String tokens for ports, class tokens for impls:
```ts
container.registerSingleton(GeminiLlmFactory);
container.register('IAdkLlmFactory', { useToken: GeminiLlmFactory });
@inject('IAdkLlmFactory') private readonly llmFactory: IAdkLlmFactory
```

## File rules

One concept per file; the name describes it. No barrels unless they unify a real public surface. Comments explain WHY, never WHAT.
