import { createApi } from '@domia/hosts';
import type { RunId } from '@domia/contracts';
import { withKernel } from '../boot.js';

export function traceShow(runId: string, json: boolean): Promise<number> {
  return withKernel(async (kernel) => {
    const r = await createApi(kernel).traces.timeline(runId as RunId);
    if (!r.ok) { console.error(r.error.message); return 1; }
    if (json) { console.log(JSON.stringify(r.data, null, 2)); return 0; }
    if (r.data.length === 0) { console.log('(no timeline for this run)'); return 0; }
    for (const e of r.data) console.log(`${new Date(e.at).toLocaleTimeString()}  ${e.kind.padEnd(9)} ${e.summary}`);
    return 0;
  });
}
