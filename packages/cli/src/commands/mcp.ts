import { bootHeadless, createApi, serveMcpStdio } from '@domia/hosts';

export async function mcpServe(): Promise<number> {
  const boot = await bootHeadless({ logLevel: 'error' });
  if (boot.isErr()) { console.error(boot.error.message); return 1; }
  const { kernel } = boot.value;

  const served = await serveMcpStdio(createApi(kernel, false));
  if (served.isErr()) { console.error(served.error.message); await kernel.shutdown(); return 1; }

  await new Promise<void>((resolve) => {
    process.stdin.on('close', resolve);
    process.on('SIGINT', resolve);
    process.on('SIGTERM', resolve);
  });
  await kernel.shutdown();
  return 0;
}
