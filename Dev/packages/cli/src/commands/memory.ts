import { EP, brandId } from '@domia/contracts';
import type { CaseId } from '@domia/contracts';
import { withKernel } from '../boot.js';

export function memoryList(caseId: string, json: boolean): Promise<number> {
  return withKernel(async (kernel) => {
    const svc = kernel.resolve(EP.MemoryService);
    if (svc.isErr()) { console.error(svc.error.message); return 1; }
    const r = await svc.value.relevant(caseId as CaseId, '');
    if (r.isErr()) { console.error(r.error.message); return 1; }
    if (json) { console.log(JSON.stringify(r.value, null, 2)); return 0; }
    if (r.value.length === 0) { console.log('(no memories for this case)'); return 0; }
    for (const m of r.value) console.log(`${m.title}${m.tags.length ? '  [' + m.tags.join(',') + ']' : ''}\n  ${m.body.trim().split('\n')[0]}`);
    return 0;
  });
}

export function memoryAdd(caseId: string, title: string, opts: { text: string; tags?: string }): Promise<number> {
  return withKernel(async (kernel) => {
    const svc = kernel.resolve(EP.MemoryService);
    if (svc.isErr()) { console.error(svc.error.message); return 1; }
    const r = await svc.value.dispatch(caseId as CaseId, {
      callId: brandId<'CallId'>('cli'), name: 'memory.save',
      args: { title, text: opts.text, ...(opts.tags ? { tags: opts.tags.split(',').map((t) => t.trim()) } : {}) },
    });
    if (r.isErr()) { console.error(r.error.message); return 1; }
    if (r.value.status !== 'ok') { console.error(r.value.error.message); return 1; }
    console.log(`✓ remembered: ${title}`);
    return 0;
  });
}
