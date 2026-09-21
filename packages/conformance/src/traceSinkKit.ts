import { brandId } from '@domia/contracts';
import type { TraceRecord, TraceSink } from '@domia/contracts';
import { suite, testCase, assert, type TestSuite } from './kit.js';

function sampleSpan(): TraceRecord {
  const now = new Date().toISOString();
  return { t: 'span', span: { spanId: brandId<'SpanId'>('s1'), traceId: brandId<'TraceId'>('t1'), name: 'conformance', attrs: {}, status: 'ok', startedAt: now, endedAt: now } };
}

/** Any TraceSink — jsonl, sqlite, third-party — must pass this. */
export function traceSinkKit(make: () => TraceSink): TestSuite {
  return suite('TraceSink', [
    testCase('write is synchronous and non-blocking (returns void, buffers internally)', async () => {
      const sink = make();
      const r = sink.write(sampleSpan()) as unknown;
      assert(r === undefined, 'write must return void (buffer internally, never await I/O)');
    }),
    testCase('flush drains without throwing', async () => {
      const sink = make();
      for (let i = 0; i < 5; i++) sink.write(sampleSpan());
      await sink.flush();
    }),
    testCase('exposes a stable id', async () => {
      assert(typeof make().id === 'string' && make().id.length > 0, 'sink.id must be a non-empty string');
    }),
  ]);
}
