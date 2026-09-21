import { AsyncLocalStorage } from 'node:async_hooks';
import { newId } from '@domia/kernel';
import { brandId } from '@domia/contracts';
import type { ArtifactId, ArtifactMeta, ArtifactRef, Attrs, ModuleResult, Span, SpanRow, TraceRecord, TraceSink, Tracer, TraceId, SpanId } from '@domia/contracts';
import { SpanImpl } from './span.js';
import { ArtifactStore } from './artifacts.js';
import { redactRecord } from './redact.js';

interface Ambient { readonly traceId: TraceId; readonly spanId: SpanId; readonly runId?: string }

export class TracerImpl implements Tracer {
  /** Ambient span context — survives awaits, isolates concurrent runs (D23). */
  private readonly als = new AsyncLocalStorage<Ambient>();

  /** Sinks resolved live so sinks registered after trace (e.g. store's) are seen. */
  constructor(private readonly getSinks: () => readonly TraceSink[], private readonly artifacts: ArtifactStore) {}

  private fan(record: TraceRecord): void {
    const safe = redactRecord(record); // never persist secrets
    for (const s of this.getSinks()) s.write(safe);
  }

  async flush(): Promise<void> {
    for (const s of this.getSinks()) await s.flush();
  }

  span(name: string, attrs?: Attrs): Span {
    const parent = this.als.getStore();
    const traceId = parent?.traceId ?? (brandId<'TraceId'>(newId(12)));
    // runId flows from an explicit attr or is inherited from the ambient run span.
    const attrRunId = typeof attrs?.['runId'] === 'string' ? (attrs['runId'] as string) : undefined;
    const runId = attrRunId ?? parent?.runId;
    const emitter = { emit: (row: SpanRow) => this.fan({ t: 'span', span: row }) };
    return new SpanImpl(traceId, name, emitter, parent?.spanId, runId, attrs);
  }

  async withSpan<T>(name: string, attrs: Attrs | undefined, fn: (span: Span) => Promise<T>): Promise<T> {
    const span = this.span(name, attrs);
    const parent = this.als.getStore();
    const runId = (typeof attrs?.['runId'] === 'string' ? (attrs['runId'] as string) : undefined) ?? parent?.runId;
    return this.als.run({ traceId: span.traceId, spanId: span.spanId, ...(runId ? { runId } : {}) }, async () => {
      try {
        const out = await fn(span);
        span.end('ok');
        return out;
      } catch (e) {
        span.end('failed');
        throw e;
      }
    });
  }

  event(name: string, attrs?: Attrs): void {
    const parent = this.als.getStore();
    const runId = typeof attrs?.['runId'] === 'string' ? (attrs['runId'] as SpanRow['runId']) : undefined;
    this.fan({ t: 'event', event: { name, attrs: attrs ?? {}, at: new Date().toISOString(), ...(parent?.spanId ? { spanId: parent.spanId } : {}), ...(runId ? { runId } : {}) } });
  }

  async saveArtifact(data: Uint8Array | ReadableStream<Uint8Array>, meta: ArtifactMeta): Promise<ModuleResult<ArtifactRef>> {
    const r = await this.artifacts.save(data, meta);
    if (r.isOk()) this.fan({ t: 'artifact', ref: r.value, ...(meta.runId ? { runId: meta.runId } : {}) });
    return r;
  }

  async openArtifact(id: ArtifactId): Promise<ModuleResult<ReadableStream<Uint8Array>>> {
    return this.artifacts.open(id);
  }
}
