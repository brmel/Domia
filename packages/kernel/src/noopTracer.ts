import { resultErr, resultOk, domiaError, moduleId, brandId } from '@domia/contracts';
import type { ArtifactId, ArtifactRef, Attrs, ModuleResult, OutcomeStatus, Span, TokenUsage, Tracer, ArtifactMeta } from '@domia/contracts';

const NOOP = moduleId('kernel');

/** D4 — spans no-op, artifacts error, until @domia/trace registers the real tracer. */
class NoopSpan implements Span {
  readonly traceId = brandId<'TraceId'>('noop');
  readonly spanId = brandId<'SpanId'>('noop');
  child(): Span { return this; }
  setAttrs(_attrs: Attrs): void {}
  addCost(_usage: TokenUsage): void {}
  end(_status: OutcomeStatus): void {}
}

export class NoopTracer implements Tracer {
  private readonly span0 = new NoopSpan();
  span(_name: string, _attrs?: Attrs): Span { return this.span0; }
  async withSpan<T>(_name: string, _attrs: Attrs | undefined, fn: (span: Span) => Promise<T>): Promise<T> { return fn(this.span0); }
  event(_name: string, _attrs?: Attrs): void {}
  async saveArtifact(_data: Uint8Array | ReadableStream<Uint8Array>, _meta: ArtifactMeta): Promise<ModuleResult<ArtifactRef>> {
    return resultErr(domiaError(NOOP, 'BAD_CONFIG', 'trace module not loaded'));
  }
  async openArtifact(_id: ArtifactId): Promise<ModuleResult<ReadableStream<Uint8Array>>> {
    return resultErr(domiaError(NOOP, 'BAD_CONFIG', 'trace module not loaded'));
  }
  async flush(): Promise<void> {}
  // help the compiler treat this as fully implementing Tracer
  static ok(): ModuleResult<void> { return resultOk(undefined); }
}
