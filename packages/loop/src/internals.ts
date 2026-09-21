import type { AgentContext, CaseContext, LoopRunInternals, RunEvent, Store, Tracer } from '@domia/contracts';

/**
 * The concrete run surface a MetaToolHandler receives (the loop casts contracts'
 * opaque `LoopRunInternals` to this). Everything a belt tool may touch, nothing more.
 */
export interface RunInternals extends LoopRunInternals {
  /** Loop-private extras on top of the public belt surface. */
  readonly caseCtx: CaseContext;
  readonly agent: AgentContext;
  readonly tracer: Tracer;
  readonly store: Store;
}

/** Backpressure-free fan-out of RunEvents to `events()` subscribers. */
export class EventHub {
  private readonly queues = new Set<{ push: (e: RunEvent) => void; end: () => void }>();

  emit(e: RunEvent): void { for (const q of this.queues) q.push(e); }
  end(): void { for (const q of this.queues) q.end(); }

  stream(signal?: AbortSignal): AsyncIterable<RunEvent> {
    const buffer: RunEvent[] = [];
    let resume: (() => void) | null = null;
    let done = false;
    const q = { push: (e: RunEvent) => { buffer.push(e); resume?.(); }, end: () => { done = true; resume?.(); } };
    this.queues.add(q);
    const stop = () => { done = true; resume?.(); };
    signal?.addEventListener('abort', stop, { once: true });
    const queues = this.queues;
    return {
      async *[Symbol.asyncIterator]() {
        try {
          while (!done || buffer.length > 0) {
            const next = buffer.shift();
            if (next === undefined) { await new Promise<void>((r) => { resume = r; }); resume = null; continue; }
            yield next;
          }
        } finally { queues.delete(q); }
      },
    };
  }
}
