import type { Store, TraceRecord, TraceSink } from '@domia/contracts';

/**
 * Persists trace records to SQLite. Non-blocking `write` (buffered); `flush`
 * awaits the in-flight drain (D13). Registered as an EP.TraceSink by the store
 * module, so the tracer — which resolves sinks live — picks it up though store
 * loads after trace.
 */
export class StoreTraceSink implements TraceSink {
  readonly id = 'store';
  private queue: TraceRecord[] = [];
  private draining: Promise<void> | null = null;

  constructor(private readonly store: Store) {}

  write(record: TraceRecord): void {
    this.queue.push(record);
    void this.kick();
  }

  private kick(): Promise<void> {
    if (this.draining) return this.draining;
    this.draining = this.drain().finally(() => { this.draining = null; });
    return this.draining;
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const r = this.queue.shift()!;
      try {
        if (r.t === 'span') await this.store.traces.insertSpan(r.span);
        else if (r.t === 'event') await this.store.traces.insertEvent(r.event);
        else if (r.t === 'exchange') await this.store.exchanges.append(r.exchange);
        else if (r.t === 'artifact') await this.store.artifacts.index({ id: r.ref.id, ...(r.runId ? { runId: r.runId } : {}), kind: r.ref.kind, mime: r.ref.mime, bytes: r.ref.bytes, sha256: r.ref.sha256, path: `${r.ref.sha256.slice(0, 2)}/${r.ref.sha256}`, ...(r.ref.label ? { label: r.ref.label } : {}), at: new Date().toISOString() });
      } catch {
        // trace persistence must never crash the app; drop on error
      }
    }
  }

  async flush(): Promise<void> {
    await this.kick();
    if (this.queue.length > 0) await this.kick();
  }
}
