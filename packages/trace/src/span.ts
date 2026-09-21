import { newId } from '@domia/kernel';
import { brandId } from '@domia/contracts';
import type { Attrs, DomiaError, OutcomeStatus, RunId, Span, SpanId, TokenUsage, TraceId, SpanRow } from '@domia/contracts';

export interface SpanEmitter {
  emit(row: SpanRow): void;
}

export class SpanImpl implements Span {
  readonly spanId: SpanId = brandId<'SpanId'>(newId(12));
  private attrs: Attrs = {};
  private cost: TokenUsage | undefined;
  private readonly startedAt = new Date().toISOString();
  private ended = false;

  constructor(
    readonly traceId: TraceId,
    private readonly name: string,
    private readonly emitter: SpanEmitter,
    private readonly parentSpanId?: SpanId,
    private readonly runId?: string,
    attrs?: Attrs,
  ) {
    if (attrs) this.attrs = { ...attrs };
  }

  child(name: string, attrs?: Attrs): Span {
    return new SpanImpl(this.traceId, name, this.emitter, this.spanId, this.runId, attrs);
  }
  setAttrs(attrs: Attrs): void { this.attrs = { ...this.attrs, ...attrs }; }
  addCost(usage: TokenUsage): void {
    const c = this.cost ?? { input: 0, output: 0 };
    this.cost = { input: c.input + usage.input, output: c.output + usage.output, thinking: (c.thinking ?? 0) + (usage.thinking ?? 0), costUsd: (c.costUsd ?? 0) + (usage.costUsd ?? 0) };
  }
  end(status: OutcomeStatus, _error?: DomiaError): void {
    if (this.ended) return;
    this.ended = true;
    this.emitter.emit({
      spanId: this.spanId,
      traceId: this.traceId,
      ...(this.parentSpanId ? { parentSpanId: this.parentSpanId } : {}),
      ...(this.runId ? { runId: this.runId as RunId } : {}),
      name: this.name,
      attrs: this.attrs,
      status,
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
      ...(this.cost ? { cost: this.cost } : {}),
    });
  }
}
