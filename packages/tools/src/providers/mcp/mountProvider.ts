import { resultErr, resultOk, domiaError, moduleId } from '@domia/contracts';
import type {
  BindingIO, McpMount, ModuleResult, SessionOptions, TargetSpec, ToolBinding, ToolCall, ToolManifest,
  ToolOutput, ToolProvider,
} from '@domia/contracts';
import { McpClient, type McpTransportSpec } from './client.js';
import { mcpToManifest, namespacedToolName } from './manifests.js';

const TOOLS = moduleId('tools');

export function mountToSpec(mount: McpMount, resolveSecret: (v: string) => string): ModuleResult<McpTransportSpec> {
  const env = Object.fromEntries(Object.entries(mount.env ?? {}).map(([k, v]) => [k, resolveSecret(String(v))]));
  if (mount.transport === 'stdio') {
    if (!mount.command) return resultErr(domiaError(TOOLS, 'BAD_CONFIG', `mount '${mount.name}': stdio needs a command`));
    return resultOk({ kind: 'stdio', command: mount.command, args: mount.args ?? [], env });
  }
  if (!mount.url) return resultErr(domiaError(TOOLS, 'BAD_CONFIG', `mount '${mount.name}': http transport needs a url`));
  // crawl4ai and friends expose SSE at /mcp/sse; streamable-http servers use /mcp.
  const kind = mount.url.includes('/sse') ? 'sse' : 'http';
  const headers = Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v]));
  return resultOk({ kind, url: mount.url, ...(Object.keys(headers).length ? { headers } : {}) });
}

/**
 * A case-mounted MCP server as a ToolProvider (E1). Auxiliary capability — not a
 * target driver (no observe). Swapping crawl4ai for firecrawl/another crawler is a
 * case-config change, no code. Adding a new capability = adding a mount.
 */
export class McpMountProvider implements ToolProvider {
  readonly id: string;
  readonly role = 'auxiliary' as const;
  readonly scope: 'session' | 'shared';

  constructor(private readonly mount: McpMount, private readonly spec: McpTransportSpec) {
    this.id = `mcp:${mount.name}`;
    this.scope = mount.scope ?? 'shared';
  }

  /** Mounts are target-agnostic — they add capability to whatever target is running. */
  supports(_target: TargetSpec): boolean { return true; }
  manifests(_target: TargetSpec): readonly ToolManifest[] { return []; } // discovered live on attach (D18)

  async attach(_target: TargetSpec, _io: BindingIO, _opts?: SessionOptions): Promise<ModuleResult<ToolBinding>> {
    const client = new McpClient(this.spec);
    const connected = await client.connect();
    if (connected.isErr()) return resultErr(connected.error);

    const listed = await client.listTools();
    if (listed.isErr()) { await client.close(); return resultErr(listed.error); }

    const mountName = this.mount.name;
    const risk = this.mount.risk ?? 'guarded';
    const nameMap = new Map<string, string>();
    const manifests: ToolManifest[] = [];
    for (const def of listed.value) {
      const domiaName = namespacedToolName(mountName, def.name);
      nameMap.set(domiaName, def.name);
      manifests.push({ ...mcpToManifest(def), name: domiaName, risk, capabilities: ['net'] });
    }

    return resultOk({
      manifests: () => manifests,
      async execute(call: ToolCall): Promise<ModuleResult<ToolOutput>> {
        const mcpName = nameMap.get(call.name);
        if (!mcpName) return resultErr(domiaError(TOOLS, 'UNKNOWN_TOOL', `'${call.name}' not on mount '${mountName}'`));
        const r = await client.callToolText(mcpName, call.args);
        return r.isErr() ? resultErr(r.error) : resultOk({ value: r.value });
      },
      async dispose(): Promise<void> { await client.close(); },
    });
  }
}
