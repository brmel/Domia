# @domia/kernel — Interface Spec

**Purpose.** The `MappAlloc`: one per process. Loads modules in dependency order,
owns the typed extension registry, event bus, scoped config/loggers, and the
tracing middleware that wraps every factory. No DI library, no decorators.

**Kind.** Root context.

Incorporates D3 (typed points), D4 (NoopTracer bootstrap, trace as core).

---

## Public interface (`index.ts`)

```ts
export function createKernel(config: KernelConfig): Kernel;   // sync, nothing started

export interface Kernel {
  load(modules: readonly DomiaModule[]): Promise<ModuleResult<void>>;   // topo order; fail fast
  resolve<T>(point: ExtensionPoint<T>): ModuleResult<T>;
  resolveAll<T>(point: ExtensionPoint<T>): ModuleResult<readonly T[]>;
  readonly events: EventBus;
  shutdown(): Promise<void>;                                            // reverse order + leak sweep
}

export interface KernelConfig {
  readonly configSources?: readonly string[];   // cosmiconfig search paths
  readonly logLevel?: 'debug'|'info'|'warn'|'error';
  readonly env?: Readonly<Record<string, string>>;
}
```

## Internal classes

| Class | File | Responsibility |
|---|---|---|
| `KernelImpl` | `kernel.ts` | orchestrates load/resolve/shutdown; builds a `ModuleHost` per module ≈150 |
| `ExtensionRegistry` | `registry.ts` | `Map<string, unknown[]>`; `register` checks arity (D3): `'one'` twice → `EXTENSION_CONFLICT`; `resolve` on empty `'one'` → `EXTENSION_MISSING` |
| `topoSort` | `topo.ts` | pure; orders by `manifest.requires`; `trace` forced first (D4); cycle → `BAD_CONFIG` |
| `TypedEventBus` | `eventBus.ts` | mitt-backed `emit/on`; `stream` = `BoundedQueue` (drop-oldest + dropped-count) |
| `ScopedConfig` | `config.ts` | `get<T>(key, schema): ModuleResult<T>` — cosmiconfig + env, Zod-validated, per-module namespace |
| `ScopedLogger` | `logger.ts` | pino child bound to `module`; **writes to stderr** so stdout stays clean for command output (D14) |
| `TracingMiddleware` | `middleware.ts` | *(slice 1 — needs K2 factories)* wraps any `register`ed `ContextFactory`: span around `alloc`/`dispose`, registers the ctx with `ContextTracker` |
| `ContextTracker` | `contextTracker.ts` | *(slice 1)* `Set<WeakRef<Context>>`; `shutdown` force-disposes survivors, logs each as a leak |
| `NoopTracer` | `noopTracer.ts` | D4 — spans no-op, `saveArtifact` → `Err(BAD_CONFIG,'trace not loaded')`; replaced once trace registers `EP.Tracer` |

## Behavior notes

- **Load** builds each module's `ModuleHost` lazily so a module resolving another
  in `init` gets what's already loaded (topo guarantees availability).
- **`host.tracer`** returns the live tracer if `EP.Tracer` is registered, else
  `NoopTracer`. Re-read per access (cheap) so trace's own late registration is
  picked up by every subsequently-initialized module.
- **`register`** returns `ModuleResult` (not void) so arity conflicts surface at
  load, not silently.
- **`shutdown`** disposes modules in reverse, then sweeps `ContextTracker` — a
  browser/MCP-server/conversation left open is closed and logged (no zombies).

## File manifest

```
kernel/
  package.json  tsconfig.json
  src/
    kernel.ts registry.ts topo.ts eventBus.ts boundedQueue.ts
    config.ts logger.ts middleware.ts contextTracker.ts noopTracer.ts
    index.ts
```
