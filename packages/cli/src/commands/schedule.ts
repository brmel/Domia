import { createScheduler } from '@domia/hosts';
import type { CaseId, ScheduleId } from '@domia/contracts';
import { withKernel } from '../boot.js';

export function scheduleCreate(caseId: string, cron: string, request: string): Promise<number> {
  return withKernel(async (kernel) => {
    const r = await createScheduler(kernel).create({ caseId: caseId as CaseId, cron, request });
    if (r.isErr()) { console.error(r.error.message); return 1; }
    console.log(`✓ scheduled ${r.value.id} — next ${r.value.nextAt}`);
    return 0;
  });
}

export function scheduleList(json: boolean): Promise<number> {
  return withKernel(async (kernel) => {
    const r = await createScheduler(kernel).list();
    if (r.isErr()) { console.error(r.error.message); return 1; }
    if (json) { console.log(JSON.stringify(r.value, null, 2)); return 0; }
    if (r.value.length === 0) { console.log('(no schedules)'); return 0; }
    for (const s of r.value) console.log(`${s.id}  ${s.cron}  → ${s.request}  (next ${s.nextAt ?? '—'})`);
    return 0;
  });
}

export function scheduleRemove(id: string): Promise<number> {
  return withKernel(async (kernel) => {
    const r = await createScheduler(kernel).remove(id as ScheduleId);
    if (r.isErr()) { console.error(r.error.message); return 1; }
    console.log(`✓ removed ${id}`);
    return 0;
  });
}
