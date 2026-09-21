import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ApiResult, CaseId, DomiaApi, HumanReply, RunId, StartOptions } from '@domia/contracts';

type Transport = Parameters<McpServer['connect']>[0];
type ToolReply = { content: { type: 'text'; text: string }[]; isError?: boolean };

const asText = (v: unknown): ToolReply => ({ content: [{ type: 'text', text: JSON.stringify(v, null, 2) }] });
const asError = (e: { code: string; message: string }): ToolReply => ({ isError: true, content: [{ type: 'text', text: `${e.code}: ${e.message}` }] });
const reply = <T>(r: ApiResult<T>): ToolReply => (r.ok ? asText(r.data) : asError(r.error));

function toHumanReply(kind: string, text?: string, approved?: boolean): HumanReply {
  if (kind === 'approve') return { kind: 'approve', approved: approved ?? false };
  if (kind === 'takeover_done') return { kind: 'takeover_done', ...(text ? { note: text } : {}) };
  return { kind: 'answer', text: text ?? '' };
}

/**
 * E6/J10 — Domia exposed *as* an MCP server. Any MCP host mounts it and drives
 * Domia as a tool. Symmetric to the McpToolProvider that consumes MCP. Long ops
 * never block: `domia_run_start` returns a runId; the host polls `domia_run_status`.
 */
export class DomiaMcpServer {
  private readonly server: McpServer;

  constructor(private readonly api: DomiaApi) {
    this.server = new McpServer({ name: 'domia', version: '0.0.0' });
    this.register();
  }

  connect(transport: Transport): Promise<void> { return this.server.connect(transport); }
  close(): Promise<void> { return this.server.close(); }

  private register(): void {
    this.server.registerTool('domia_run_start', {
      description: 'Start an autonomous Domia run against a case. Returns { runId } immediately — the run continues in the background; poll domia_run_status for progress. A run that needs a human auto-suspends (unattended).',
      inputSchema: { caseId: z.string(), request: z.string(), options: z.record(z.unknown()).optional() },
    }, async ({ caseId, request, options }) => {
      const r = await this.api.runs.start(caseId as CaseId, request, options as StartOptions | undefined);
      return r.ok ? asText({ runId: r.data }) : asError(r.error);
    });

    this.server.registerTool('domia_run_status', {
      description: 'Get a run\'s current status, request, and (once finished) its report.',
      inputSchema: { runId: z.string() },
    }, async ({ runId }) => reply(await this.api.runs.get(runId as RunId)));

    this.server.registerTool('domia_run_answer', {
      description: 'Resolve a run waiting on a human: kind=answer with text, kind=approve with approved, or kind=takeover_done.',
      inputSchema: { runId: z.string(), kind: z.enum(['answer', 'approve', 'takeover_done']), text: z.string().optional(), approved: z.boolean().optional() },
    }, async ({ runId, kind, text, approved }) => reply(await this.api.runs.answer(runId as RunId, toHumanReply(kind, text, approved))));

    this.server.registerTool('domia_case_list', {
      description: 'List cases (targets Domia can run against) to choose a caseId.',
      inputSchema: {},
    }, async () => reply(await this.api.cases.list()));

    this.server.registerTool('domia_trace_timeline', {
      description: 'Audit a finished run: its timeline of spans, agent/tool exchanges, and artifacts.',
      inputSchema: { runId: z.string() },
    }, async ({ runId }) => reply(await this.api.traces.timeline(runId as RunId)));
  }
}
