import { EP } from '@domia/contracts';
import type { RunId } from '@domia/contracts';
import { withKernel } from '../boot.js';

export function runsList(json: boolean): Promise<number> {
  return withKernel(async (kernel) => {
    const store = kernel.resolve(EP.Store);
    if (store.isErr()) { console.error(store.error.message); return 1; }
    const r = await store.value.runs.list({ limit: 30 });
    if (r.isErr()) { console.error(r.error.message); return 1; }
    if (json) { console.log(JSON.stringify(r.value.rows, null, 2)); return 0; }
    if (r.value.rows.length === 0) { console.log('(no runs yet)'); return 0; }
    for (const run of r.value.rows) {
      const mark = run.status === 'ok' ? '✓' : run.status === 'running' ? '…' : '✗';
      console.log(`${mark} ${run.id}  ${run.status.padEnd(9)} ${run.request.slice(0, 60)}`);
    }
    return 0;
  });
}

export function runsShow(id: string, json: boolean): Promise<number> {
  return withKernel(async (kernel) => {
    const store = kernel.resolve(EP.Store);
    if (store.isErr()) { console.error(store.error.message); return 1; }
    const runR = await store.value.runs.get(id as RunId);
    const spansR = await store.value.traces.spansByRun(id as RunId);
    const artifactsR = await store.value.artifacts.byRun(id as RunId);
    const planR = await store.value.plans.get(id as RunId);
    if (runR.isErr()) { console.error(runR.error.message); return 1; }
    if (!runR.value) { console.error(`run '${id}' not found`); return 1; }
    const artifacts = artifactsR.isOk() ? artifactsR.value : [];
    if (json) {
      console.log(JSON.stringify({ run: runR.value, spans: spansR.isOk() ? spansR.value : [], artifacts, plan: planR.isOk() ? planR.value : null }, null, 2));
      return 0;
    }
    const run = runR.value;
    console.log(`run ${run.id}\n  status: ${run.status}\n  request: ${run.request}\n  case: ${run.caseId}`);
    if (run.report) console.log(`  summary: ${run.report.summary}`);
    if (run.report?.stats) {
      const s = run.report.stats;
      console.log(`  stats: ${s.turns} turns, ${s.calls} calls, ${s.usage.input + s.usage.output} tokens, ${(s.durationMs / 1000).toFixed(1)}s`);
    }
    if (spansR.isOk()) console.log(`  spans: ${spansR.value.length} (${spansR.value.map((s) => s.name).join(', ')})`);
    if (planR.isOk() && planR.value) {
      const done = planR.value.items.filter((i) => i.status === 'done').length;
      console.log(`  plan: ${planR.value.items.length} items (${done} done, rev ${planR.value.plan.revision})`);
    }
    if (artifacts.length > 0) {
      console.log('  artifacts:');
      for (const a of artifacts) console.log(`    ${a.kind.padEnd(10)} ${String(a.bytes).padStart(8)}B  ${a.label ?? a.sha256.slice(0, 12)}`);
    }
    return 0;
  });
}
