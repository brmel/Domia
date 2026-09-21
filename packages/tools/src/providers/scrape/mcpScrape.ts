import { resultOk, resultErr, domiaError, moduleId } from '@domia/contracts';
import type {
  BindingIO, ModuleResult, NativeSnapshot, Observation, SessionOptions,
  TargetSpec, ToolBinding, ToolCall, ToolManifest, ToolOutput, ToolProvider,
} from '@domia/contracts';
import { McpClient, type McpTransportSpec } from '../mcp/client.js';
import { mcpToManifest, namespacedToolName } from '../mcp/manifests.js';

const TOOLS = moduleId('tools');
const SNAPSHOT_CHARS = 12_000;

export interface ScrapeServiceSpec {
  readonly id: string;
  readonly transport: (target: Extract<TargetSpec, { kind: 'web' }>) => McpTransportSpec;
  readonly requiredEnv?: readonly string[];
  readonly seed?: { readonly tool: string; readonly urlArg: string };
  readonly risk?: ToolManifest['risk'];
}

/**
 * Any scraping MCP server (firecrawl, crawl4ai, …) as a `role:'target'` driver.
 * Adding a service is a config object, not a new class. Selected via
 * `SessionOptions.driver` / config; API keys read from the environment.
 */
export class McpScrapeProvider implements ToolProvider {
  readonly id: string;
  readonly role = 'target' as const;
  readonly scope = 'session' as const;

  constructor(private readonly spec: ScrapeServiceSpec) { this.id = spec.id; }

  supports(target: TargetSpec): boolean { return target.kind === 'web'; }
  manifests(_target: TargetSpec): readonly ToolManifest[] { return []; }

  async attach(target: TargetSpec, _io: BindingIO, _opts?: SessionOptions): Promise<ModuleResult<ToolBinding>> {
    if (target.kind !== 'web') return resultErr(domiaError(TOOLS, 'BAD_CONFIG', `${this.id} cannot serve target '${target.kind}'`));

    const missing = (this.spec.requiredEnv ?? []).filter((k) => !process.env[k]);
    if (missing.length) return resultErr(domiaError(TOOLS, 'PROVIDER_AUTH', `${this.id} needs env: ${missing.join(', ')}`));

    const client = new McpClient(this.spec.transport(target));
    const connected = await client.connect();
    if (connected.isErr()) return resultErr(connected.error);

    const listed = await client.listTools();
    if (listed.isErr()) { await client.close(); return resultErr(listed.error); }

    const risk = this.spec.risk ?? 'guarded';
    const nameMap = new Map<string, string>();
    const manifests: ToolManifest[] = listed.value.map((def) => {
      const name = namespacedToolName(this.spec.id, def.name);
      nameMap.set(name, def.name);
      return { ...mcpToManifest(def), name, risk, capabilities: ['net', 'dom'] };
    });

    let lastText = '';
    let prevSnapshot: string | undefined;
    const seed = this.spec.seed;
    if (seed) {
      const r = await client.callToolText(seed.tool, { [seed.urlArg]: target.url });
      if (r.isErr()) { await client.close(); return resultErr(r.error); }
      lastText = r.value;
    }

    const snapshotNow = (): Observation => {
      const snapshot: NativeSnapshot = { kind: 'native', text: lastText.slice(0, SNAPSHOT_CHARS) };
      const obs: Observation = { snapshot, url: target.url, changedSinceLast: snapshot.text !== prevSnapshot };
      prevSnapshot = snapshot.text;
      return obs;
    };

    return resultOk({
      manifests: () => manifests,
      observe: async (): Promise<ModuleResult<Observation>> => resultOk(snapshotNow()),
      async execute(call: ToolCall): Promise<ModuleResult<ToolOutput>> {
        const mcpName = nameMap.get(call.name);
        if (!mcpName) return resultErr(domiaError(TOOLS, 'UNKNOWN_TOOL', `'${call.name}' not on ${call.name.split('.')[0]}`));
        const r = await client.callToolText(mcpName, call.args);
        if (r.isErr()) return resultErr(r.error);
        lastText = r.value;
        return resultOk({ value: r.value, observation: snapshotNow() });
      },
      async dispose(): Promise<void> { await client.close(); },
    });
  }
}

export function firecrawlProvider(): McpScrapeProvider {
  return new McpScrapeProvider({
    id: 'firecrawl',
    requiredEnv: ['FIRECRAWL_API_KEY'],
    transport: () => ({ kind: 'stdio', command: 'npx', args: ['-y', 'firecrawl-mcp'] }),
    seed: { tool: 'firecrawl_scrape', urlArg: 'url' },
  });
}

export function crawl4aiProvider(): McpScrapeProvider {
  const url = process.env['CRAWL4AI_URL'] ?? 'http://localhost:11235/mcp/sse';
  return new McpScrapeProvider({
    id: 'crawl4ai',
    transport: () => ({ kind: url.includes('/sse') ? 'sse' : 'http', url }),
    seed: { tool: 'md', urlArg: 'url' },
  });
}
