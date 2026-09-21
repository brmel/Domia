import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { bootHeadless } from '@domia/hosts';
import { createApi } from '@domia/api';
import { createDomiaMcpServer } from '@domia/domia-mcp';
import type { AgentTurn } from '@domia/contracts';
import type { Kernel } from '@domia/kernel';
import { must, mustApi, tmpDir } from './harness.js';

const SCRIPT: AgentTurn[] = [{ kind: 'final', summary: 'served over MCP', verdict: 'pass' }];

/** Parse a tool call's first text block back into data. */
async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const res = await client.callTool({ name, arguments: args });
  const content = (res.content ?? []) as Array<{ type: string; text?: string }>;
  const text = content.map((c) => c.text ?? '').join('');
  return res.isError ? { error: text } : JSON.parse(text);
}

describe('@domia/domia-mcp: Domia served as an MCP server (E6)', () => {
  let kernel: Kernel;
  let dataDir: string;
  let client: Client;

  beforeAll(async () => {
    dataDir = tmpDir('mcp');
    kernel = must(await bootHeadless({
      dataDir, artifactsDir: join(dataDir, 'artifacts'), dbPath: join(dataDir, 'domia.db'), logLevel: 'error',
      agent: { replay: () => SCRIPT },
    })).kernel;
    // Unattended surface (D12): user.ask degrades to suspend.
    const server = createDomiaMcpServer(createApi(kernel, false));
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await server.connect(serverT);
    client = new Client({ name: 'test-host', version: '0.0.0' }, { capabilities: {} });
    await client.connect(clientT);
  });
  afterAll(async () => { await client.close(); await kernel.shutdown(); rmSync(dataDir, { recursive: true, force: true }); });

  it('advertises the Domia tool surface to an MCP host', async () => {
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['domia_run_start', 'domia_run_status', 'domia_run_answer', 'domia_case_list', 'domia_trace_timeline']));
  });

  it('drives Domia end-to-end: create a case, start a run, poll status', async () => {
    // Seed a case through the facade (case creation isn't an MCP tool).
    const created = mustApi(await createApi(kernel).cases.create({ name: 'mcp case', target: { kind: 'web', url: 'https://example.com' } }));

    const list = (await call(client, 'domia_case_list')) as { rows: { id: string }[] };
    expect(list.rows.some((c) => c.id === created.id)).toBe(true);

    const start = (await call(client, 'domia_run_start', { caseId: created.id, request: 'do it over MCP', options: { personaOverrides: { lead: { model: { provider: 'replay', model: 'scripted' } } } } })) as { runId: string };
    expect(typeof start.runId).toBe('string');

    // Non-blocking contract: start returned immediately; poll status until it settles.
    let status = (await call(client, 'domia_run_status', { runId: start.runId })) as { runId: string; status: string };
    for (let i = 0; i < 50 && status.status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 40));
      status = (await call(client, 'domia_run_status', { runId: start.runId })) as { runId: string; status: string };
    }
    expect(status.status).toBe('ok');

    const timeline = (await call(client, 'domia_trace_timeline', { runId: start.runId })) as unknown[];
    expect(Array.isArray(timeline)).toBe(true);
  }, 60_000);
});
