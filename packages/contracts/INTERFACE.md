# @domia/contracts — Interface Spec

**Purpose.** The shared language: branded ids, error catalog, base
Context/Outcome contracts, typed extension points, every module's public
interface as types, Zod schemas. Types only — imports `zod` + `neverthrow`, no
Node builtins.

**Kind.** K0 (types). No runtime except Zod schemas + typed-const maps.

Incorporates D1 (sound Outcome), D2 (error-layer rule), D3 (typed extension
points), D5 (ProposedCall vs ToolCall).

---

## `ids.ts`

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };
export type ModuleId   = Brand<string, 'ModuleId'>;
export type ContextId  = Brand<string, 'ContextId'>;
export type RunId      = Brand<string, 'RunId'>;
export type CaseId     = Brand<string, 'CaseId'>;
export type PlanId     = Brand<string, 'PlanId'>;
export type ItemId     = Brand<string, 'ItemId'>;
export type PersonaId  = Brand<string, 'PersonaId'>;
export type CallId     = Brand<string, 'CallId'>;
export type ArtifactId = Brand<string, 'ArtifactId'>;
export type TraceId    = Brand<string, 'TraceId'>;
export type SpanId     = Brand<string, 'SpanId'>;
export type MemoryId   = Brand<string, 'MemoryId'>;
export type ScheduleId = Brand<string, 'ScheduleId'>;
export type SecretRef  = Brand<string, 'SecretRef'>;   // 'secret://gh-token'
export type PromptRef  = Brand<string, 'PromptRef'>;   // 'personas/lead' → prompts/personas/lead.md
export const newId: <B extends string>(brand: B) => Brand<string, B>;  // nanoid-backed
```

## `errors.ts`  (D2)

```ts
export const ErrorCode = {
  // contract / could-not-start  → carried by ModuleResult.Err
  BAD_CONFIG:'BAD_CONFIG', INVALID_ARGS:'INVALID_ARGS', UNKNOWN_TOOL:'UNKNOWN_TOOL',
  TARGET_BUSY:'TARGET_BUSY', TARGET_UNREACHABLE:'TARGET_UNREACHABLE',
  PROVIDER_AUTH:'PROVIDER_AUTH', RUN_NOT_LIVE:'RUN_NOT_LIVE', NOT_FOUND:'NOT_FOUND',
  EXTENSION_MISSING:'EXTENSION_MISSING', EXTENSION_CONFLICT:'EXTENSION_CONFLICT',
  // domain / ran-but-failed     → carried by Outcome.failed
  TOOL_FAILED:'TOOL_FAILED', TOOL_TIMEOUT:'TOOL_TIMEOUT', AGENT_MALFORMED:'AGENT_MALFORMED',
  MCP_SERVER_ERROR:'MCP_SERVER_ERROR', CANCELLED:'CANCELLED', SUSPENDED:'SUSPENDED',
} as const;
export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];

export interface DomiaError {
  readonly code: ErrorCode;
  readonly module: ModuleId;
  readonly message: string;          // human, secret-free
  readonly retryable: boolean;
  readonly cause?: unknown;
  readonly data?: Record<string, unknown>;
}
export type ModuleResult<T> = import('neverthrow').Result<T, DomiaError>;
export const err: (module: ModuleId, code: ErrorCode, message: string, extra?: Partial<DomiaError>) => DomiaError;
```

## `outcome.ts`  (D1)

```ts
export type OutcomeStatus = 'ok' | 'failed' | 'cancelled' | 'timeout' | 'suspended';
export interface TokenUsage { input: number; output: number; thinking?: number; costUsd?: number }
export interface OutcomeMeta {
  readonly startedAt: string; readonly endedAt: string; readonly durationMs: number;
  readonly traceId: TraceId; readonly spanId: SpanId;
  readonly artifacts: readonly ArtifactRef[];
  readonly cost?: TokenUsage;
}
export type Outcome<T> =
  | { readonly status: 'ok'; readonly value: T; readonly meta: OutcomeMeta; toJSON(): unknown }
  | { readonly status: Exclude<OutcomeStatus,'ok'>; readonly error: DomiaError;
      readonly meta: OutcomeMeta; toJSON(): unknown };
export const ok:   <T>(value: T, meta: OutcomeMeta) => Outcome<T>;
export const fail: <T>(status: Exclude<OutcomeStatus,'ok'>, error: DomiaError, meta: OutcomeMeta) => Outcome<T>;

export interface ArtifactRef {
  readonly id: ArtifactId;
  readonly kind: 'screenshot'|'video'|'snapshot'|'file'|'report'|'recording';
  readonly mime: string; readonly bytes: number; readonly sha256: string; readonly label?: string;
}
```

## `module.ts` + `context.ts` + extension points  (D3)

```ts
export interface ExtensionPoint<T> { readonly id: string; readonly arity: 'one'|'many' }
export const ep: <T>(id: string, arity: 'one'|'many') => ExtensionPoint<T>;

export interface ModuleManifest {
  readonly id: ModuleId; readonly version: string;
  readonly provides: readonly ExtensionPoint<unknown>[];
  readonly requires: readonly ModuleId[];
}
export interface DomiaModule {
  readonly manifest: ModuleManifest;
  init(host: ModuleHost): Promise<ModuleResult<void>>;
  dispose(): Promise<void>;
}
export interface ModuleHost {
  readonly config: ScopedConfig;
  readonly logger: Logger;
  readonly events: EventBus;
  readonly tracer: Tracer;                                    // NoopTracer until trace loads (D4)
  resolve<T>(point: ExtensionPoint<T>): ModuleResult<T>;                 // 'one'
  resolveAll<T>(point: ExtensionPoint<T>): ModuleResult<readonly T[]>;   // 'many'
  register<T>(point: ExtensionPoint<T>, impl: T): ModuleResult<void>;    // arity-checked
}

export interface Context<TConfig, TState = Record<string, never>> {
  readonly id: ContextId;
  configure(patch: Partial<TConfig>): ModuleResult<void>;    // sync
  inspect(): Readonly<TConfig & TState>;                     // sync
  dispose(): Promise<void>;                                  // async, idempotent
}
export interface ContextFactory<C, X extends Context<C, any>> { alloc(config: C): Promise<ModuleResult<X>> }
export type CancelSignal = AbortSignal;
```

## `events.ts`

```ts
export interface DomiaEventMap {
  'module.loaded':    { module: ModuleId; version: string };
  'run.started':      { runId: RunId; caseId: CaseId; request: string; parentRunId?: RunId };
  'run.turn':         { runId: RunId; seq: number; turn: AgentTurnSummary };
  'run.call':         { runId: RunId; call: ToolCallSummary; status: OutcomeStatus };
  'run.plan.changed': { runId: RunId; revision: number; diff: PlanDiff };
  'run.waiting_user': { runId: RunId; question: string; kind: 'ask'|'approval'|'takeover' };
  'run.signal':       { runId: RunId; signal: Signal };
  'run.spawned':      { runId: RunId; childRunId: RunId; persona: PersonaId };
  'run.terminal':     { runId: RunId; status: OutcomeStatus; report: RunReport };
  'artifact.saved':   { runId?: RunId; ref: ArtifactRef };
  'schedule.fired':   { scheduleId: ScheduleId; runId: RunId };
}
export type Unsubscribe = () => void;
export interface EventBus {
  emit<K extends keyof DomiaEventMap>(t: K, p: DomiaEventMap[K]): void;
  on<K extends keyof DomiaEventMap>(t: K, fn: (p: DomiaEventMap[K]) => void): Unsubscribe;
  stream<K extends keyof DomiaEventMap>(t: K, signal?: AbortSignal): AsyncIterable<DomiaEventMap[K]>;
}
export interface Signal { readonly kind: 'budget'|'duration'|'plan_stale'|'context_pressure'|'idle'|'policy'; readonly message: string; readonly data?: Record<string, unknown> }
```

## Per-module interface files (signatures live in each package's INTERFACE.md)

`tools.ts` `agent.ts` `case.ts` `plan.ts` `memory.ts` `loop.ts` `trace.ts`
`store.ts` `api.ts` — each re-exported from `index.ts`. `ToolManifest`,
`ProposedCall`/`ToolCall` (D5), `Observation`, `AgentTurn`/`StepInput`, `Plan`/
`PlanItem`/`PlanOp`/`PlanDiff`, `RunOptions`/`Persona`/`RunReport`, `TargetSpec`/
`CaseAssets`, `DomiaApi` are all declared here (imported by consumers as types).

## `schemas/`

One `*.schema.ts` (Zod) per wire/row type: case draft, run options, plan op,
tool args envelope, api inputs, every store row. `parse` at api edges + store
read/write.

## File manifest

```
contracts/
  package.json  tsconfig.json
  src/
    ids.ts errors.ts outcome.ts module.ts context.ts events.ts
    tools.ts agent.ts case.ts plan.ts memory.ts loop.ts trace.ts store.ts api.ts
    signal.ts secret.ts prompt.ts extensionPoints.ts
    schemas/*.schema.ts
    index.ts
```
