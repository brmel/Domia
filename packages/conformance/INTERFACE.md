# @domia/conformance — Interface Spec

**Purpose.** Executable specs every extension-point implementation must pass —
built-in or third-party. MIL-style certification; no mocks, real kernel.

**Kind.** Test kit (consumed by each package's e2e + third parties).

---

## Public interface

```ts
export function toolProviderKit(make: () => ToolProvider, fixture: TargetSpec): TestSuite;
export function agentProviderKit(make: () => AgentProvider): TestSuite;
export function metaToolKit(make: () => MetaToolHandler): TestSuite;
export function traceSinkKit(make: () => TraceSink): TestSuite;
```

## What each kit asserts

| Kit | Assertions (representative) |
|---|---|
| `toolProviderKit` | manifest validity (Zod parses its own examples); **invalid args → `Err(INVALID_ARGS)`, not throw**; timeout → `Outcome.timeout` shape; success carries `observation` when applicable (D6); `dispose` idempotent; `scope` honored (D8) |
| `agentProviderKit` | **propose-only**: given a tool, the provider never executes it — only emits `act` with `ProposedCall`s (D5); `ask`/`final` shapes valid; `final.verdict` optional; `restore(snapshot(x)) ≡ x` behaviorally (D10); network error → `Err(PROVIDER_*)` vs malformed → `Outcome.failed(AGENT_MALFORMED)` (D2) |
| `metaToolKit` | manifest gating respects run options/capabilities; `dispatch` unknown → `Err(UNKNOWN_TOOL)`; effects traced |
| `traceSinkKit` | `write` non-blocking (returns before I/O); `flush` drains; secrets already redacted upstream (sink sees none) |

## How it's used

- Each provider package's e2e imports the matching kit and runs it against the
  real implementation inside a real (minimal) kernel — never a mocked host.
- `AiSdkProvider` and `ReplayProvider` pass the **same** `agentProviderKit`;
  playwright-mcp `McpToolProvider` and a third-party MCP mount pass the same
  `toolProviderKit`. Passing the kit *is* the definition of "a valid provider".

## File manifest

```
conformance/
  package.json  tsconfig.json
  src/ toolProviderKit.ts agentProviderKit.ts metaToolKit.ts traceSinkKit.ts
       harness.ts   # spins a minimal real kernel for a kit
       index.ts
```
