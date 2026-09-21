import mitt, { type Emitter } from 'mitt';
import type { DomiaEventMap, EventBus, Unsubscribe } from '@domia/contracts';

type Events = { [K in keyof DomiaEventMap]: DomiaEventMap[K] };

const DEFAULT_BUFFER = 256;

export class TypedEventBus implements EventBus {
  private readonly e: Emitter<Events> = mitt<Events>();

  emit<K extends keyof DomiaEventMap>(type: K, payload: DomiaEventMap[K]): void {
    this.e.emit(type, payload);
  }

  on<K extends keyof DomiaEventMap>(type: K, fn: (p: DomiaEventMap[K]) => void): Unsubscribe {
    const handler = (p: DomiaEventMap[K]) => fn(p);
    this.e.on(type, handler as never);
    return () => this.e.off(type, handler as never);
  }

  /** Bounded queue, drop-oldest with a counter (back-pressure-safe). */
  stream<K extends keyof DomiaEventMap>(type: K, signal?: AbortSignal): AsyncIterable<DomiaEventMap[K]> {
    const buffer: DomiaEventMap[K][] = [];
    let resume: (() => void) | null = null;
    let done = false;

    const off = this.on(type, (p) => {
      if (buffer.length >= DEFAULT_BUFFER) buffer.shift(); // drop-oldest: consumer fell behind
      buffer.push(p);
      resume?.();
    });
    const stop = () => { done = true; off(); resume?.(); };
    signal?.addEventListener('abort', stop, { once: true });

    return {
      async *[Symbol.asyncIterator]() {
        try {
          while (!done) {
            const next = buffer.shift();
            if (next === undefined) {
              await new Promise<void>((r) => { resume = r; });
              resume = null;
              continue;
            }
            yield next;
          }
        } finally {
          off();
        }
      },
    };
  }
}
