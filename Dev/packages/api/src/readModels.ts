import { resultOk, resultErr } from '@domia/contracts';
import type { ModuleResult, RunId, Store, TimelineEntry } from '@domia/contracts';

/**
 * Shape a run's timeline from what the store persisted: spans, the agent/tool
 * exchange tape, and captured artifacts, merged and ordered by time. The trace
 * module owns writing; the facade owns the read model (no EP.TraceQuery needed).
 */
export async function timeline(store: Store, runId: RunId): Promise<ModuleResult<readonly TimelineEntry[]>> {
  const spans = await store.traces.spansByRun(runId);
  if (spans.isErr()) return resultErr(spans.error);
  const tape = await store.exchanges.listByRun(runId);
  if (tape.isErr()) return resultErr(tape.error);
  const artifacts = await store.artifacts.byRun(runId);
  if (artifacts.isErr()) return resultErr(artifacts.error);

  const entries: TimelineEntry[] = [
    ...spans.value.map((s): TimelineEntry => ({ at: s.startedAt, kind: 'span', summary: `${s.name} (${s.status})`, detail: { spanId: s.spanId, name: s.name, status: s.status, cost: s.cost } })),
    ...tape.value.map((e): TimelineEntry => ({ at: e.at, kind: 'exchange', summary: `${e.direction}`, detail: e.payload })),
    ...artifacts.value.map((a): TimelineEntry => ({ at: a.at, kind: 'artifact', summary: `${a.kind} (${a.mime})`, detail: { id: a.id, path: a.path, bytes: a.bytes } })),
  ];
  entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return resultOk(entries);
}
