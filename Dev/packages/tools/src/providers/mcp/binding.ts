import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resultErr, resultOk, domiaError, moduleId } from '@domia/contracts';
import type {
  BindingIO, ModuleResult, Observation, SessionOptions, ToolBinding, ToolCall, ToolManifest, ToolOutput,
} from '@domia/contracts';
import { McpClient } from './client.js';
import { mcpToManifest, domiaNameToMcp } from './manifests.js';
import { parseObservation, snapshotObservation } from './observe.js';
import { ScreenshotCollector } from './capture.js';
import { DiagnosticsCollector } from './diagnostics.js';
import { playwrightEval } from './pageEval.js';

const TOOLS = moduleId('tools');
const HARNESS_OWNED_LIFECYCLE = new Set(['browser.close', 'browser.install']);
const STATE_CHANGING = /^browser\.(navigate|click|type|press|select|hover|drag|drop|fill|wait|tabs|navigate\.back)/;
const STORAGE_STATE_FILE = 'storage-state.json';
const READ_STORAGE_STATE = 'async (page) => JSON.stringify(await page.context().storageState())';
const READ_URL = 'async (page) => page.url()';

export interface LaunchPlan {
  readonly runner: { readonly command: string; readonly env?: Record<string, string> };
  readonly cli: string;
  readonly outDir: string;
  readonly common: readonly string[];
  modeArgs(headed: boolean, authStateFile?: string): readonly string[];
  readonly canFlipDisplayMode: boolean;
  readonly startUrl?: string;
}

export class PlaywrightBinding implements ToolBinding {
  private client: McpClient | undefined;
  private diagnostics: DiagnosticsCollector | undefined;
  private discoveredManifests: readonly ToolManifest[] = [];
  private lastSnapshot: string | undefined;
  private readonly shots: ScreenshotCollector;
  private headed: boolean;
  private authStateFile: string | undefined;

  constructor(
    private readonly plan: LaunchPlan,
    private readonly io: BindingIO,
    private readonly opts: SessionOptions | undefined,
  ) {
    this.shots = new ScreenshotCollector(plan.outDir, io);
    this.headed = opts?.headed ?? false;
    this.authStateFile = opts?.authStateFile;
  }

  async start(): Promise<ModuleResult<void>> {
    const up = await this.launchBrowser(this.headed);
    if (up.isErr()) return resultErr(up.error);
    if (!this.plan.startUrl) return resultOk(undefined);
    const landed = await this.goTo(this.plan.startUrl);
    if (landed.isErr()) { await this.client?.close(); return resultErr(landed.error); }
    return resultOk(undefined);
  }

  manifests(): readonly ToolManifest[] { return this.discoveredManifests; }

  async observe(): Promise<ModuleResult<Observation>> {
    const client = this.connected();
    if (client.isErr()) return resultErr(client.error);
    const obs = await snapshotObservation(client.value, this.lastSnapshot);
    if (obs) this.lastSnapshot = obs.snapshot.text;
    return obs ? resultOk(obs) : resultErr(domiaError(TOOLS, 'TOOL_FAILED', 'snapshot failed'));
  }

  async execute(call: ToolCall): Promise<ModuleResult<ToolOutput>> {
    const connected = this.connected();
    if (connected.isErr()) return resultErr(connected.error);
    const client = connected.value;
    const r = await client.callToolText(domiaNameToMcp(call.name), call.args);
    if (r.isErr()) return resultErr(r.error);

    let observation = await this.observationFor(call.name, r.value);
    const shot = await this.shots.collect(call.name);
    if (shot && observation) observation = { ...observation, screenshot: shot };
    const value = shot ? { text: r.value, screenshot: shot } : r.value;
    return resultOk(observation ? { value, observation } : { value });
  }

  async exportAuthState(): Promise<ModuleResult<string>> {
    const client = this.connected();
    return client.isErr() ? resultErr(client.error) : playwrightEval(client.value, READ_STORAGE_STATE);
  }

  async setHeaded(headed: boolean): Promise<ModuleResult<void>> {
    if (headed === this.headed) return resultOk(undefined);
    if (!this.plan.canFlipDisplayMode) return resultErr(domiaError(TOOLS, 'BAD_CONFIG', 'this target is already a real window; nothing to flip'));
    const connected = this.connected();
    if (connected.isErr()) return resultErr(connected.error);

    await this.keepAuthStateForNextLaunch();
    const url = await playwrightEval(connected.value, READ_URL);
    await this.shutdownBrowser();

    const relaunched = await this.launchBrowser(headed);
    if (relaunched.isErr()) {
      const restored = await this.launchBrowser(this.headed);
      return resultErr(restored.isErr()
        ? relaunched.error
        : domiaError(TOOLS, 'TOOL_FAILED', `could not go ${headed ? 'headed' : 'headless'}: ${relaunched.error.message}`, { cause: relaunched.error }));
    }
    this.headed = headed;
    this.lastSnapshot = undefined;

    const resumeAt = url.isOk() && /^https?:/.test(url.value) ? url.value : this.plan.startUrl;
    if (resumeAt) await this.goTo(resumeAt);
    return resultOk(undefined);
  }

  async dispose(): Promise<void> {
    await this.shutdownBrowser();
  }

  private connected(): ModuleResult<McpClient> {
    return this.client ? resultOk(this.client) : resultErr(domiaError(TOOLS, 'BAD_CONFIG', 'browser not connected'));
  }

  private async launchBrowser(headed: boolean): Promise<ModuleResult<void>> {
    const args = [this.plan.cli, ...this.plan.modeArgs(headed, this.authStateFile), ...this.plan.common];
    const { command, env } = this.plan.runner;
    const client = new McpClient({ kind: 'stdio', command, args, ...(env ? { env } : {}) });
    const conn = await client.connect();
    if (conn.isErr()) return resultErr(conn.error);
    const listed = await client.listTools();
    if (listed.isErr()) { await client.close(); return resultErr(listed.error); }

    this.client = client;
    this.discoveredManifests = listed.value.map(mcpToManifest).filter((m) => !HARNESS_OWNED_LIFECYCLE.has(m.name));
    this.diagnostics = new DiagnosticsCollector(client, this.plan.outDir, this.io);
    await this.diagnostics.start({ video: this.opts?.record?.video ?? true, trace: this.opts?.record?.trace ?? true });
    return resultOk(undefined);
  }

  private async shutdownBrowser(): Promise<void> {
    await this.diagnostics?.finish().catch(() => []);
    this.diagnostics = undefined;
    await this.client?.close();
    this.client = undefined;
  }

  private async keepAuthStateForNextLaunch(): Promise<void> {
    const state = await this.exportAuthState();
    if (state.isErr()) return;
    const path = join(this.plan.outDir, STORAGE_STATE_FILE);
    try {
      await writeFile(path, state.value, 'utf8');
      this.authStateFile = path;
    } catch {
      return;
    }
  }

  private async goTo(url: string): Promise<ModuleResult<void>> {
    const connected = this.connected();
    if (connected.isErr()) return resultErr(connected.error);
    const nav = await connected.value.callToolText('browser_navigate', { url });
    if (nav.isErr()) return resultErr(nav.error);
    this.lastSnapshot = parseObservation(nav.value, this.lastSnapshot).snapshot.text;
    return resultOk(undefined);
  }

  private async observationFor(toolName: string, resultText: string): Promise<Observation | undefined> {
    const client = this.client;
    if (!client) return undefined;
    if (STATE_CHANGING.test(toolName)) {
      const fresh = await snapshotObservation(client, this.lastSnapshot);
      if (fresh) this.lastSnapshot = fresh.snapshot.text;
      return fresh;
    }
    if (toolName === 'browser.snapshot') {
      const parsed = parseObservation(resultText, this.lastSnapshot);
      this.lastSnapshot = parsed.snapshot.text;
      return parsed;
    }
    return undefined;
  }
}
