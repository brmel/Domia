# @domia/agent — Interface Spec

**Purpose.** The brain socket. One propose-only conversation interface over any
LLM library. Never executes a tool — it emits intents. Default provider =
`AiSdkProvider` (Vercel AI SDK, 25+ models, E3) + `ReplayProvider`.

**Kind.** K2 factory (`AgentContext`) + K3 providers (`AgentProvider`).

Incorporates D5 (ProposedCall), D2 (Err vs Outcome for LLM calls),
D10 (opaque snapshot), R7 (failover).

---

## Public interfaces (contracts `agent.ts`)

```ts
export interface AgentService {                            // EP.AgentService (one)
  providers(): readonly ProviderInfo[];                    // sync
  models(providerId: string): Promise<ModuleResult<readonly ModelInfo[]>>;
  alloc(config: AgentConfig): Promise<ModuleResult<AgentContext>>;
}
export interface AgentConfig {
  readonly persona: PersonaId;
  readonly model: ModelSpec;                               // { provider; model } or a failover chain
  readonly systemPrompt: PromptRef;                        // prompts/*.md — never inline
  readonly tools: readonly ToolManifest[];                 // composed by the loop's ToolsetComposer (D7)
  readonly temperature?: number; readonly thinking?: ThinkingConfig;
  readonly auth: AuthRef;                                  // key ref / ADC / none(local)
}
export type ModelSpec = { provider: string; model: string } | { chain: readonly { provider: string; model: string }[] };  // R7

export interface AgentContext extends Context<AgentConfig, AgentState> {
  step(input: StepInput, signal?: CancelSignal): Promise<ModuleResult<Outcome<AgentTurn>>>;
  stream(): AsyncIterable<AgentStreamEvent>;               // optional live tokens/thoughts
  fork(): Promise<ModuleResult<AgentContext>>;             // sub-runs / what-ifs
  snapshot(): Promise<ModuleResult<ConversationSnapshot>>; // D10 — opaque, provider-tagged
  restore(s: ConversationSnapshot): Promise<ModuleResult<void>>;
}

export type StepInput =
  | { kind: 'goal';        goal: string; observation?: Observation }
  | { kind: 'toolResults'; results: readonly ToolResultLine[]; observation?: Observation }
  | { kind: 'user';        message: string }               // user.ask answers, approval/takeback replies
  | { kind: 'informant';   signals: readonly Signal[] };   // information, not command
export interface ToolResultLine { readonly callId: CallId; readonly outcome: Outcome<ToolOutput> }

export type AgentTurn =                                     // D5 — proposes, does not run
  | { kind: 'act';   calls: readonly ProposedCall[]; thought?: string }
  | { kind: 'ask';   question: string }
  | { kind: 'final'; summary: string; verdict?: 'pass'|'fail'; value?: unknown };

export interface AgentProvider {                           // EP.AgentProvider (many)
  readonly id: string;
  models(): Promise<ModuleResult<readonly ModelInfo[]>>;
  alloc(config: AgentConfig): Promise<ModuleResult<AgentContext>>;
}
export interface ConversationSnapshot { readonly provider: string; readonly version: string; readonly blob: unknown }  // D10
```

## Internal classes

| Class | File | Responsibility |
|---|---|---|
| `AgentModule` / `AgentServiceImpl` | `module.ts` `service.ts` | routes to provider; wraps `alloc` with `FailoverChain` |
| `ModelRegistry` | `modelRegistry.ts` | resolves persona → ordered model list (settings + per-run override) |
| failover chain | `providers/aisdk/context.ts` | R7 — `step()` advances to the next model in the chain on a provider error, then retries; never on task difficulty |
| `parseModelSpec` / `parseModelRef` | `modelSpec.ts` | `provider:model[,provider:model…]` → `ModelSpec`; one vocabulary for CLI/UI (D36) |
| `ConversationLog` | `conversation.ts` | provider-neutral message list; `snapshot`/`restore` glue |
| `AiSdkProvider` | `providers/aisdk/provider.ts` | one `generateText`/`streamText` per `step`; tools declared **without execute** → SDK returns calls (D5) |
| `ToolSchemaMapper` | `providers/aisdk/map.ts` | `ToolManifest.parameters` (Zod) ⇄ AI SDK tool schema |
| `SdkLoopBridge` | `providers/aisdk/bridge.ts` | for any SDK insisting on executing tools: stub parks → surface `act` → resume on results |
| `ReplayProvider` | `providers/replay/provider.ts` | serves `trace.agentExchanges(runId)` turn-by-turn; ≈100 lines |

## Design notes / problems handled

- **D2 for LLM calls.** Network failure after provider retries → `Err(PROVIDER_*)`
  (couldn't run → failover). A returned-but-unparseable tool call → `Outcome.failed(AGENT_MALFORMED)`
  (ran, bad result → the loop may retry via failover or feed back). Crisp, testable.
- **D5.** `step` yields `ProposedCall`s (name+args only); the loop stamps `callId`.
  Terminal is the `final` **turn**, not a tool — SDK finish-tools map to it.
- **D10.** `ConversationSnapshot` is opaque + provider-tagged; conformance kit
  asserts `restore(snapshot(x)) ≡ x` behaviorally. No cross-provider schema.
- **Propose-only is enforced by construction** — tools handed to the SDK have no
  `execute`, so it *cannot* run them; it can only report intended calls.

## File manifest

```
agent/
  package.json  tsconfig.json
  src/
    module.ts service.ts context.ts conversation.ts snapshot.ts
    modelRegistry.ts failover.ts
    providers/aisdk/{provider.ts, map.ts, bridge.ts}
    providers/replay/provider.ts
    index.ts
```
