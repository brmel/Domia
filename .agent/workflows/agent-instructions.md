---
description: Mandatory rules for all code contributions to Auto-QA
---

# Agent Rules

Follow these rules for all code in this project. No exceptions.

---

## Architecture

```
src/domain/         → Pure business logic. Only imports: neverthrow
src/application/    → Use cases. Imports: domain/, neverthrow, tsyringe
src/infrastructure/ → Adapters. Imports: domain/, external libraries
src/presentation/   → UI. Imports: application/, domain/, react, zustand
```

**Violation = reject the code.**

---

## Types

| Rule | Example |
|------|---------|
| No `any` | Use `unknown` + validation |
| No `as` casts | Use type guards or branded type factories |
| No thrown exceptions | Return `Result<T, E>` or `ResultAsync<T, E>` |
| No nullable without `| null` | Explicit union types |
| Branded types for IDs | `TestRunId`, `Url`, `ElementId` |

---

## neverthrow

```typescript
// Sync
Result<T, E>  →  ok(value) | err(error)

// Async
ResultAsync<T, E>  →  ResultAsync.fromPromise(promise, errorMapper)

// Chaining
result.andThen(fn).map(fn).mapErr(fn)

// Never do this
try { ... } catch { ... }  // ❌
```

---

## Async Patterns

| Context | Pattern | When |
|---------|---------|------|
| **Ports** | `ResultAsync<T, E>` | Single atomic operations |
| **Use Cases** | `AsyncGenerator<Event, Result>` | Multi-step orchestration |

```typescript
// Ports: ResultAsync for atomic ops
interface ILLMProvider {
  generateAction(ctx: LLMContext): ResultAsync<AgentAction, LLMError>;
}

// Use Cases: AsyncGenerator for streaming
class RunTestUseCase {
  async *execute(input): AsyncGenerator<TestRunEvent, TestOutput> {
    yield { type: 'thinking' };
    const action = await this.llm.generateAction(ctx);
    yield { type: 'acting', action };
  }
}
```

**Rules:**
- Ports always return `ResultAsync` (atomic, stateless)
- Use cases return `AsyncGenerator` when streaming events to UI
- Check `CancellationToken` between yields
- Never block the event loop

---

## tsyringe

```typescript
@injectable()
export class MyService {
  constructor(
    @inject('IPortName') private port: IPortName
  ) {}
}
```

Register in `src/infrastructure/di/container.ts`.

---

## I/O Abstraction

All external input/output through ports:

```typescript
// Input: { url, prompt } → IInputPort
// Output: { response, file } → IOutputPort
```

Use cases receive `IInputPort`, return via `IOutputPort`. Never couple to specific formats.

---

## Functions

| Rule | Value |
|------|-------|
| Max lines | 30 |
| Max params | 4 (use object for more) |
| Single responsibility | One function, one job |
| Pure when possible | No side effects |

---

## Naming

| Type | Convention | Example |
|------|------------|---------|
| Interface (port) | `I` prefix | `IBrowserAutomation` |
| Branded type | PascalCase | `TestRunId` |
| Adapter | `*Adapter` suffix | `PlaywrightAdapter` |
| Use case | `*UseCase` suffix | `RunTestUseCase` |
| Error | `*Error` suffix | `NavigationError` |

---

## Testing

| Layer | Required | Mock |
|-------|----------|------|
| Domain | Yes, 100% | None needed |
| Application | Yes, 90% | All ports |
| Infrastructure | Integration | Real services |

```typescript
// Mock pattern
const mockPort = { method: vi.fn().mockReturnValue(okAsync(value)) };
```

---

## Security

- `nodeIntegration: false`
- `contextIsolation: true`
- Validate all IPC inputs
- API keys in keychain (keytar), never in code

---

## Before Committing

```bash
npm run typecheck && npm run lint && npm run test
```

All must pass.

---

## References

- [ARCHITECTURE.md](../docs/ARCHITECTURE.md) — Layer details
- [TESTING.md](../docs/TESTING.md) — Test patterns
- [CONFIGURATION.md](../docs/CONFIGURATION.md) — Env/secrets
- [SECURITY.md](../docs/SECURITY.md) — Security checklist
