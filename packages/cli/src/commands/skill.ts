import { createApi } from '@domia/hosts';
import { withKernel } from '../boot.js';

export function skillList(json: boolean): Promise<number> {
  return withKernel(async (kernel) => {
    const r = await createApi(kernel).skills.list();
    if (!r.ok) { console.error(r.error.message); return 1; }
    if (json) { console.log(JSON.stringify(r.data, null, 2)); return 0; }
    if (r.data.length === 0) { console.log('(no skills)'); return 0; }
    for (const s of r.data) console.log(`${s.name}  [${s.tags.join(',')}]\n  ${s.description}`);
    return 0;
  });
}

export function skillShow(name: string, json: boolean): Promise<number> {
  return withKernel(async (kernel) => {
    const r = await createApi(kernel).skills.get(name);
    if (!r.ok) { console.error(r.error.message); return 1; }
    console.log(json ? JSON.stringify(r.data, null, 2) : `# ${r.data.name}\n${r.data.body}`);
    return 0;
  });
}
