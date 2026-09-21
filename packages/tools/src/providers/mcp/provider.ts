import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resultErr, resultOk, domiaError, moduleId } from '@domia/contracts';
import type { BindingIO, ModuleResult, SessionOptions, TargetSpec, ToolBinding, ToolManifest, ToolProvider } from '@domia/contracts';
import { PlaywrightBinding, type LaunchPlan } from './binding.js';
import { attachToCdp, launchElectron, defaultCdpPort, type LaunchedApp } from './launcher.js';
import { playwrightMcpCli, nodeRunner, type NodeRunner } from './runtime.js';

const TOOLS = moduleId('tools');
const FULL_CAPS = ['--caps', 'vision,pdf,devtools', '--console-level', 'info', '--save-session'];

function webLaunchPlan(runner: NodeRunner, cli: string, outDir: string, url: string): LaunchPlan {
  return {
    runner, cli, outDir,
    common: ['--output-dir', outDir, ...FULL_CAPS],
    canFlipDisplayMode: true,
    startUrl: url,
    modeArgs: (headed, authStateFile) => [
      ...(headed ? [] : ['--headless']), '--isolated', '--browser', 'chromium',
      ...(authStateFile ? ['--storage-state', authStateFile] : []),
    ],
  };
}

function electronLaunchPlan(runner: NodeRunner, cli: string, outDir: string, cdpEndpoint: string): LaunchPlan {
  return {
    runner, cli, outDir,
    common: ['--output-dir', outDir, ...FULL_CAPS],
    canFlipDisplayMode: false,
    modeArgs: () => ['--cdp-endpoint', cdpEndpoint],
  };
}

export class PlaywrightMcpProvider implements ToolProvider {
  readonly id = 'playwright-mcp';
  readonly role = 'target' as const;
  readonly scope = 'session' as const;

  supports(target: TargetSpec): boolean {
    return target.kind === 'web' || target.kind === 'electron';
  }

  manifests(_target: TargetSpec): readonly ToolManifest[] {
    return [];
  }

  async attach(target: TargetSpec, io: BindingIO, opts?: SessionOptions): Promise<ModuleResult<ToolBinding>> {
    if (target.kind !== 'web' && target.kind !== 'electron') {
      return resultErr(domiaError(TOOLS, 'BAD_CONFIG', `playwright-mcp cannot serve target '${target.kind}'`));
    }
    let cli: string;
    try { cli = playwrightMcpCli(); }
    catch (e) { return resultErr(domiaError(TOOLS, 'BAD_CONFIG', 'playwright-mcp is not installed', { cause: e })); }

    const outDir = mkdtempSync(join(tmpdir(), 'pwmcp-'));
    const runner = nodeRunner();

    let app: LaunchedApp | undefined;
    let plan: LaunchPlan;
    if (target.kind === 'electron') {
      const launched = target.attach
        ? await attachToCdp(target.attach.cdpPort)
        : await launchElectron(target.appPath, target.args ?? [], defaultCdpPort());
      if (launched.isErr()) { await rm(outDir, { recursive: true, force: true }).catch(() => {}); return resultErr(launched.error); }
      app = launched.value;
      plan = electronLaunchPlan(runner, cli, outDir, app.cdpEndpoint);
    } else {
      plan = webLaunchPlan(runner, cli, outDir, target.url);
    }

    const binding = new PlaywrightBinding(plan, io, opts);
    const started = await binding.start();
    if (started.isErr()) {
      await app?.dispose();
      await rm(outDir, { recursive: true, force: true }).catch(() => {});
      return resultErr(started.error);
    }

    return resultOk({
      manifests: () => binding.manifests(),
      observe: () => binding.observe(),
      execute: (call) => binding.execute(call),
      setHeaded: (headed) => binding.setHeaded(headed),
      exportAuthState: () => binding.exportAuthState(),
      async dispose(): Promise<void> {
        await binding.dispose();
        await app?.dispose();
        await rm(outDir, { recursive: true, force: true }).catch(() => {});
      },
    });
  }
}
