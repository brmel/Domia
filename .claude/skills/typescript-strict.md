---
name: typescript-strict
description: Conventions for TypeScript in this repo. Branded types, typed const over enum, exactOptionalPropertyTypes, noUncheckedIndexedAccess, Result over throw.
---

# TypeScript — Strict Conventions

We run with `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`, `noUnusedLocals`, `noUnusedParameters`. Treat each as load-bearing.

## Typed const over enum

Prefer:

```ts
export const CheckpointReason = {
    RunInitialized: 'run_initialized',
    PlanReady: 'plan_ready',
} as const;
export type CheckpointReason = typeof CheckpointReason[keyof typeof CheckpointReason];
```

Reasons:
- Tree-shakes (enums leave runtime objects).
- Same call-site ergonomics as `enum`.
- The inferred string literal flows through generics.
- DB-persisted vocabularies stay readable as strings.

Use `enum` only when we need a numeric mapping (e.g. `LogLevel = 0|1|2|3`).

## Branded types for IDs and validated strings

```ts
declare const __runIdBrand: unique symbol;
export type RunId = string & { readonly [__runIdBrand]: void };
```

Pair with a factory that performs validation: `RunIdFactory.create()`. Never cast `'foo' as RunId`.

## Result over throw across layer boundaries

- Domain operations: return `Result<T, DomainError>`.
- Application use cases: return `Result<T, AppError>`.
- Infrastructure adapters: may throw at the edge, but ports return `Result`.
- Routers/CLI: catch `Result` and translate to HTTP/IPC/exit code.

```ts
import { ResultAsync, ok, err } from 'neverthrow';
return await this.persistence.saveRun(run)
    .map(() => runId)
    .mapErr((e) => new PersistenceError(e.message, e));
```

## exactOptionalPropertyTypes traps

`{ x?: string }` is **not** the same as `{ x: string | undefined }`. With `exactOptionalPropertyTypes`, you cannot assign `undefined` to `x` — you must omit the property entirely.

Use the spread idiom:

```ts
{ platform: 'web', url, ...(windowTitle ? { windowTitle } : {}) }
```

## noUncheckedIndexedAccess

`array[0]` is `T | undefined`, not `T`. Use:
- `array[0]!` only if you guarantee non-empty.
- `const first = array[0]; if (!first) return;` for safety.
- `Array.find` returns `T | undefined` — handle the `undefined`.

## File and folder rules

- One concept per file. The file name describes the concept.
- No barrel re-exports unless they unify a real public API surface (e.g. `domain/value-objects/index.ts`). Don't barrel for the sake of it.
- No comments unless they explain WHY the code is non-obvious. Never restate WHAT the code does.

## DI tokens

`tsyringe` with string tokens for ports, class tokens for impls:

```ts
container.register('IRunRepository', { useToken: 'IPersistenceAdapter' });
container.registerSingleton(RunUseCase);
@inject('IRunRepository') private readonly persistence: IRunRepository
```

## Validation before action

Before reporting a task done, run:

```bash
npx tsc --noEmit
npm run check:architecture
```

Both must be 0 errors / passing.
