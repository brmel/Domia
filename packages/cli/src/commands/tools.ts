import { bootHeadless } from '@domia/hosts';
import { EP, brandId } from '@domia/contracts';
import type { TargetSpec } from '@domia/contracts';
import { parseUrl } from '../parse.js';

/** Slice-1 demo: drive a real page through playwright-mcp via TargetSession. */
export async function toolsInvoke(url: string, opts: { steps?: string }): Promise<number> {
  const parsed = parseUrl(url);
  if (!parsed.ok) { console.error(parsed.error); return 1; }
  const boot = await bootHeadless();
  if (boot.isErr()) { console.error(boot.error.message); return 1; }
  const { kernel } = boot.value;

  const svc = kernel.resolve(EP.ToolService);
  if (svc.isErr()) { console.error(svc.error.message); await kernel.shutdown(); return 1; }

  const target: TargetSpec = { kind: 'web', url };
  console.log(`allocating session → ${url} …`);
  const sessionR = await svc.value.allocSession(target);
  if (sessionR.isErr()) { console.error('allocSession:', sessionR.error.message); await kernel.shutdown(); return 1; }
  const session = sessionR.value;

  console.log(`tools offered: ${session.manifests().length}`);

  const obsR = await session.observe();
  if (obsR.isOk() && obsR.value.status === 'ok') {
    const o = obsR.value.value;
    console.log(`\n=== observe ===\nurl: ${o.url}\ntitle: ${o.title}\nsnapshot (first 400):\n${o.snapshot.text.slice(0, 400)}`);
  } else {
    console.error('observe failed');
  }

  // optional: run comma-separated steps like "click:e6"
  for (const step of (opts.steps ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [action, ref] = step.split(':');
    const name = action === 'click' ? 'browser.click' : `browser.${action}`;
    const args = ref ? { element: `ref ${ref}`, target: ref } : {};
    const call = { callId: brandId<'CallId'>('cli'), name, args };
    const r = await session.invoke(call);
    if (r.isOk() && r.value.status === 'ok') {
      const out = r.value.value;
      console.log(`\n=== ${name} ${ref ?? ''} → ok ===`);
      if (out.observation) console.log(`now at: ${out.observation.url} — ${out.observation.title}`);
    } else {
      console.error(`${name} failed`);
    }
  }

  await session.dispose();
  await kernel.shutdown();
  return 0;
}
