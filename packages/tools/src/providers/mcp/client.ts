import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { resultErr, resultOk, domiaError, moduleId } from '@domia/contracts';
import type { ModuleResult } from '@domia/contracts';

const TOOLS = moduleId('tools');

export interface McpToolDef {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: Record<string, unknown>;
}

/** How to reach an MCP server. Any server, any transport — the swappable seam. */
export type McpTransportSpec =
  | { readonly kind: 'stdio'; readonly command: string; readonly args?: readonly string[]; readonly env?: Readonly<Record<string, string>> }
  | { readonly kind: 'sse'; readonly url: string; readonly headers?: Readonly<Record<string, string>> }
  | { readonly kind: 'http'; readonly url: string; readonly headers?: Readonly<Record<string, string>> };

/** The SDK's transports differ slightly under exactOptionalPropertyTypes; treat as the shared Transport. */
type Transport = Parameters<Client['connect']>[0];

function buildTransport(spec: McpTransportSpec): Transport {
  if (spec.kind === 'stdio') {
    return new StdioClientTransport({
      command: spec.command,
      args: [...(spec.args ?? [])],
      // Inherit PATH etc. so `npx`/`uvx` resolve; mount env (e.g. tokens) layered on top.
      env: { ...(process.env as Record<string, string>), ...(spec.env ?? {}) },
    });
  }
  const url = new URL(spec.url);
  const requestInit = spec.headers ? { headers: { ...spec.headers } } : undefined;
  return (spec.kind === 'sse'
    ? new SSEClientTransport(url, requestInit ? { requestInit } : undefined)
    : new StreamableHTTPClientTransport(url, requestInit ? { requestInit } : undefined)) as Transport;
}

/** Thin wrapper over one MCP server connection (stdio | sse | streamable http). */
export class McpClient {
  private client: Client | undefined;

  constructor(private readonly spec: McpTransportSpec, private readonly connectTimeoutMs = 30_000) {}

  async connect(): Promise<ModuleResult<void>> {
    try {
      const transport = buildTransport(this.spec);
      this.client = new Client({ name: 'domia', version: '0.0.0' }, { capabilities: {} });
      // Bound the handshake so a hung/missing server can't wedge the run.
      const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`MCP connect timed out after ${this.connectTimeoutMs}ms`)), this.connectTimeoutMs).unref());
      await Promise.race([this.client.connect(transport), timeout]);
      return resultOk(undefined);
    } catch (e) {
      await this.close();
      const where = this.spec.kind === 'stdio' ? this.spec.command : this.spec.url;
      return resultErr(domiaError(TOOLS, 'TARGET_UNREACHABLE', `failed to reach MCP server (${this.spec.kind}: ${where})`, { cause: e }));
    }
  }

  async listTools(): Promise<ModuleResult<readonly McpToolDef[]>> {
    if (!this.client) return resultErr(domiaError(TOOLS, 'BAD_CONFIG', 'MCP client not connected'));
    try {
      const res = await this.client.listTools();
      return resultOk(res.tools.map((t) => ({ name: t.name, description: t.description ?? '', inputSchema: (t.inputSchema ?? {}) as Record<string, unknown> })));
    } catch (e) {
      return resultErr(domiaError(TOOLS, 'MCP_SERVER_ERROR', 'listTools failed', { cause: e }));
    }
  }

  /** Returns the concatenated text content of the tool result. */
  async callToolText(name: string, args: Record<string, unknown>): Promise<ModuleResult<string>> {
    if (!this.client) return resultErr(domiaError(TOOLS, 'BAD_CONFIG', 'MCP client not connected'));
    try {
      const res = await this.client.callTool({ name, arguments: args });
      const content = (res.content ?? []) as Array<{ type: string; text?: string }>;
      const text = content.map((c) => (c.type === 'text' ? c.text ?? '' : `[${c.type}]`)).join('\n');
      if (res.isError) return resultErr(domiaError(TOOLS, 'MCP_SERVER_ERROR', text || `tool '${name}' errored`, { retryable: true }));
      return resultOk(text);
    } catch (e) {
      return resultErr(domiaError(TOOLS, 'MCP_SERVER_ERROR', `callTool '${name}' failed`, { cause: e, retryable: true }));
    }
  }

  async close(): Promise<void> {
    try { await this.client?.close(); } catch { /* ignore */ }
  }
}
