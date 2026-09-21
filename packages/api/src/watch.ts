import { EP } from '@domia/contracts';
import type { PlanRevision, RunEvent, RunId, RunView } from '@domia/contracts';
import type { Kernel } from '@domia/kernel';
import type { RunRegistry } from './runRegistry.js';

/**
 * F5 — sync-first. A late subscriber (opens a run view mid-run, or after it ended)
 * gets a full snapshot before any live event, so the UI never renders a gap.
 */
export async function* watchRun(kernel: Kernel, registry: RunRegistry, id: RunId, signal?: AbortSignal): AsyncIterable<RunEvent> {
  const store = kernel.resolve(EP.Store);
  if (store.isOk()) {
    const row = await store.value.runs.get(id);
    if (row.isOk() && row.value) {
      const view: RunView = { runId: id, status: row.value.status, request: row.value.request, ...(row.value.report ? { report: row.value.report } : {}) };
      yield { type: 'sync', view };
    }
  }
  const run = registry.get(id);
  if (!run) return; // not live — the snapshot was the whole story
  for await (const e of run.events(signal)) {
    yield e;
    if (e.type === 'terminal') break;
  }
}

/** Plan revisions as they land: persisted history first, then new revisions while live. */
export async function* watchPlan(kernel: Kernel, registry: RunRegistry, runId: RunId, signal?: AbortSignal): AsyncIterable<PlanRevision> {
  const planSvc = kernel.resolve(EP.PlanService);
  if (planSvc.isErr()) return;
  let maxRev = -1;
  const seed = await planSvc.value.history(runId);
  if (seed.isOk()) for (const rev of seed.value) { yield rev; maxRev = Math.max(maxRev, rev.revision); }

  const run = registry.get(runId);
  if (!run) return;
  for await (const e of run.events(signal)) {
    if (e.type === 'plan') {
      const h = await planSvc.value.history(runId);
      if (h.isOk()) for (const rev of h.value) if (rev.revision > maxRev) { yield rev; maxRev = rev.revision; }
    }
    if (e.type === 'terminal') break;
  }
}
