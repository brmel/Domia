import { createApi } from '@domia/hosts';
import { withKernel } from '../boot.js';

export function settingsGet(json: boolean): Promise<number> {
  return withKernel(async (kernel) => {
    const r = await createApi(kernel).settings.get();
    if (!r.ok) { console.error(r.error.message); return 1; }
    console.log(json ? JSON.stringify(r.data, null, 2) : Object.entries(r.data).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join('\n') || '(no settings)');
    return 0;
  });
}

export function settingsSet(key: string, value: string): Promise<number> {
  return withKernel(async (kernel) => {
    const r = await createApi(kernel).settings.patch({ [key]: value });
    if (!r.ok) { console.error(r.error.message); return 1; }
    console.log(`✓ ${key} = ${JSON.stringify(value)}`);
    return 0;
  });
}
