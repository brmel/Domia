import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { TraceRecord, TraceSink } from '@domia/contracts';

/**
 * Per-process JSONL sink. `write` is non-blocking; `flush` awaits any in-flight
 * drain so the "flush at run terminal" durability guarantee actually holds
 * (see DECISIONS D13 — an early-returning flush loses buffered writes).
 */
export class JsonlSink implements TraceSink {
  readonly id = 'jsonl';
  private queue: string[] = [];
  private draining: Promise<void> | null = null;
  private ensured = false;

  constructor(private readonly path: string) {}

  write(record: TraceRecord): void {
    this.queue.push(JSON.stringify({ at: new Date().toISOString(), ...record }));
    void this.kick();
  }

  private kick(): Promise<void> {
    if (this.draining) return this.draining;
    this.draining = this.drain().finally(() => { this.draining = null; });
    return this.draining;
  }

  private async drain(): Promise<void> {
    try {
      if (!this.ensured) { await mkdir(dirname(this.path), { recursive: true }); this.ensured = true; }
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.queue.length).join('\n') + '\n';
        await appendFile(this.path, batch);
      }
    } catch {
      // trace must never crash the app; drop on IO error
    }
  }

  /** Await the in-flight drain, then guarantee the queue is empty. */
  async flush(): Promise<void> {
    await this.kick();
    if (this.queue.length > 0) await this.kick();
  }
}
