import { bootHeadless, type Kernel } from '@domia/hosts';

export async function withKernel(fn: (kernel: Kernel) => Promise<number>): Promise<number> {
  const boot = await bootHeadless();
  if (boot.isErr()) { console.error(boot.error.message); return 1; }
  try { return await fn(boot.value.kernel); }
  finally { await boot.value.kernel.shutdown(); }
}
