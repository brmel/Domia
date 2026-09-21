import { EP } from '@domia/contracts';
import type { RunId } from '@domia/contracts';
import { withKernel } from '../boot.js';

export function planShow(runId: string, json: boolean): Promise<number> {
  return withKernel(async (kernel) => {
    const svc = kernel.resolve(EP.PlanService);
    if (svc.isErr()) { console.error(svc.error.message); return 1; }
    const r = await svc.value.get(runId as RunId);
    if (r.isErr()) { console.error(r.error.message); return 1; }
    if (!r.value) { console.error(`no plan for run '${runId}'`); return 1; }
    if (json) { console.log(JSON.stringify(r.value, null, 2)); return 0; }
    console.log(`plan for run ${runId} — rev ${r.value.revision}, ${r.value.status}`);
    if (r.value.items.length === 0) { console.log('  (agent kept no plan for this run)'); return 0; }
    const mark = { pending: '○', active: '◐', done: '●', dropped: '✗' } as const;
    for (const it of r.value.items) console.log(`  ${mark[it.status]} ${it.title}${it.note ? '  — ' + it.note : ''}`);
    return 0;
  });
}
