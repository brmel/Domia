import { resultErr, resultOk, domiaError, moduleId } from '@domia/contracts';
import type { DomiaApi, ModuleResult } from '@domia/contracts';
import { DomiaMcpServer } from './server.js';

const MCP = moduleId('domia-mcp');

export { DomiaMcpServer } from './server.js';

/** Wrap a DomiaApi as an MCP server. Pass an api built with interactive=false so runs stay unattended. */
export function createDomiaMcpServer(api: DomiaApi): DomiaMcpServer {
  return new DomiaMcpServer(api);
}

/** Serve over stdio — what an MCP host spawns (`domia mcp`). Logs stay on stderr. */
export async function serveStdio(api: DomiaApi): Promise<ModuleResult<void>> {
  try {
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    await createDomiaMcpServer(api).connect(new StdioServerTransport());
    return resultOk(undefined);
  } catch (e) {
    return resultErr(domiaError(MCP, 'IO', 'failed to serve MCP over stdio', { cause: e }));
  }
}
