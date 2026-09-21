# @domia/trace — Interface Spec

**Purpose.** What happened: span trees, events, artifacts (the `MbufAlloc`), cost
accounting, pluggable sinks, and the replay read-side. Core module — loaded first
so its tracer replaces the kernel's `NoopTracer` (D4).

**Kind.** K1 services (`Tracer`, `TraceQuery`) + `Span` micro-context + K3 sinks.

---

## Public interfaces (contracts `trace.ts`, implemented here)

```ts
export interface Tracer {
  span(name: string, attrs?: Attrs): Span;                 // sync
  event(name: string, attrs?: Attrs): void;                // sync
  saveArtifact(data: Uint8Array | ReadableStream, meta: ArtifactMeta): Promise<ModuleResult<ArtifactRef>>;
  openArtifact(id: ArtifactId): Promise<ModuleResult<ReadableStream>>;
  flush(): Promise<void>;                                  // D16 — run-terminal durability hook
}
export interface Span {                                    // micro-context (alloc = span(), free = end())
  readonly traceId: TraceId; readonly spanId: SpanId;
  child(name: string, attrs?: Attrs): Span;
  setAttrs(attrs: Attrs): void;
  addCost(usage: TokenUsage): void;                        // rolls up to parent + run total
  end(status: OutcomeStatus, error?: DomiaError): void;    // idempotent
}
export interface TraceSink {                               // EP.TraceSink (many)
  readonly id: string;
  write(record: TraceRecord): void;                        // MUST be non-blocking
  flush(): Promise<void>;
}
export interface TraceQuery {
  runTree(runId: RunId): Promise<ModuleResult<SpanTree>>;
  agentExchanges(runId: RunId): Promise<ModuleResult<readonly AgentExchange[]>>;  // replay source
  timeline(runId: RunId): Promise<ModuleResult<readonly TimelineEntry[]>>;        // UI
}
export type TraceRecord =
  | { t: 'span';     span: SpanRow }
  | { t: 'event';    event: EventRow }
  | { t: 'exchange'; exchange: AgentExchange }   // agent turn or tool call — the replay unit
  | { t: 'artifact'; ref: ArtifactRef; runId?: RunId };
```

## Internal classes

| Class | File | Responsibility |
|---|---|---|
| `TraceModule` | `module.ts` | registers `EP.Tracer` (replaces Noop), `EP.TraceSink` built-ins, `TraceQuery` |
| `TracerImpl` | `tracer.ts` | mints trace/span ids, fans `TraceRecord`s to the ring |
| `SpanImpl` | `span.ts` | attrs + cost roll-up; `end` emits a `span` record once |
| `RingBuffer` | `ring.ts` | bounded; hot path never blocks; sinks drain on a timer/idle |
| `RedactionFilter` | `redact.ts` | strips `secret://` values + known-secret keys before any record leaves |
| `ArtifactStore` | `artifacts.ts` | `saveArtifact` → sha256, dedupe, write `artifacts/<ab>/<sha>`, return ref; `openArtifact` streams |
| `JsonlSink` | `sinks/jsonl.ts` | per-run trace.jsonl; **`flush` awaits the in-flight drain** (D13) — never early-returns |
| `StoreSink` | `sinks/store.ts` | writes span/event/exchange/artifact rows via `EP.Store` |
| `OtlpSink` | `sinks/otlp.ts` | env-gated OTLP span export |
| `TraceQueryImpl` | `query.ts` | reads rows via store; shapes tree/timeline; `agentExchanges` ordered by `(runId, seq)` |

## Design notes / problems handled

- **Bootstrap (D4).** Registering `EP.Tracer` is what promotes the process from
  Noop to real tracing; ordering guaranteed by `topoSort` forcing trace first.
- **Non-blocking sinks.** `write` buffers; a slow sink (OTLP) can never stall a
  run. `flush` at run terminal + shutdown.
- **Replay contract.** Every agent turn and tool call is one `exchange` record
  with a monotonic `seq` per run — this *is* the replay tape (`ReplayProvider`
  reads `agentExchanges`). Redaction runs before persistence, so replay tapes are
  secret-free yet behavior-complete.
- **Artifacts are refs everywhere.** Bytes live on disk content-addressed; rows,
  events, and the wire only carry `ArtifactRef` (F4 protocol serves them).

## File manifest

```
trace/
  package.json  tsconfig.json
  src/
    module.ts tracer.ts span.ts ring.ts redact.ts artifacts.ts query.ts
    sinks/jsonl.ts sinks/store.ts sinks/otlp.ts
    index.ts
```
