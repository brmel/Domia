import type { DomiaError, ModuleResult } from './errors.js';
import type { ArtifactId, RunId, SpanId, TraceId } from './ids.js';
import type { ArtifactRef, OutcomeStatus, TokenUsage } from './outcome.js';

export type Attrs = Record<string, string | number | boolean | null | undefined>;

/** Micro-context: alloc = span(), free = end(). All methods sync (buffered). */
export interface Span {
  readonly traceId: TraceId;
  readonly spanId: SpanId;
  child(name: string, attrs?: Attrs): Span;
  setAttrs(attrs: Attrs): void;
  addCost(usage: TokenUsage): void;
  end(status: OutcomeStatus, error?: DomiaError): void;
}

export interface ArtifactMeta {
  readonly kind: ArtifactRef['kind'];
  readonly mime: string;
  readonly label?: string;
  readonly runId?: RunId;
}

export interface Tracer {
  span(name: string, attrs?: Attrs): Span;
  /**
   * D23 — scoped span that auto-nests under the ambient span and auto-ends: 'ok'
   * if `fn` resolves, 'failed' if it throws. Use this on the hot path so the
   * run→tool span tree is real (a bare `span()` is a root and breaks nesting).
   */
  withSpan<T>(name: string, attrs: Attrs | undefined, fn: (span: Span) => Promise<T>): Promise<T>;
  event(name: string, attrs?: Attrs): void;
  saveArtifact(data: Uint8Array | ReadableStream<Uint8Array>, meta: ArtifactMeta): Promise<ModuleResult<ArtifactRef>>;
  openArtifact(id: ArtifactId): Promise<ModuleResult<ReadableStream<Uint8Array>>>;
  /**
   * Await all buffered records reaching their sinks. Consumers call this at run
   * terminal so the durability guarantee holds (D16). Sinks' own flush must await
   * any in-flight drain, never early-return (D13).
   */
  flush(): Promise<void>;
}

export interface SpanRow {
  readonly spanId: SpanId;
  readonly traceId: TraceId;
  readonly parentSpanId?: SpanId;
  readonly runId?: RunId;
  readonly name: string;
  readonly attrs: Attrs;
  readonly status: OutcomeStatus;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly cost?: TokenUsage;
}
export interface EventRow {
  readonly runId?: RunId;
  readonly spanId?: SpanId;
  readonly name: string;
  readonly attrs: Attrs;
  readonly at: string;
}
/** One agent turn or tool call — the replay unit. seq is monotonic per run. */
export interface AgentExchange {
  readonly runId: RunId;
  readonly seq: number;
  readonly direction: 'agent' | 'tool' | 'user';
  readonly payload: unknown;
  readonly usage?: TokenUsage;
  readonly at: string;
}

export type TraceRecord =
  | { readonly t: 'span'; readonly span: SpanRow }
  | { readonly t: 'event'; readonly event: EventRow }
  | { readonly t: 'exchange'; readonly exchange: AgentExchange }
  | { readonly t: 'artifact'; readonly ref: ArtifactRef; readonly runId?: RunId };

/** EP.TraceSink (many). write MUST be non-blocking; buffer internally. */
export interface TraceSink {
  readonly id: string;
  write(record: TraceRecord): void;
  flush(): Promise<void>;
}

export interface TimelineEntry {
  readonly at: string;
  readonly kind: 'span' | 'event' | 'exchange' | 'artifact';
  readonly summary: string;
  readonly detail: unknown;
}
