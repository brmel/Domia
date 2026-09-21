import { EP } from '@domia/contracts';
import type { CaseId, McpMount, TargetSpec } from '@domia/contracts';
import { parseUrl } from '../parse.js';
import { withKernel } from '../boot.js';

export function caseAdd(name: string, opts: { url: string; tags?: string }): Promise<number> {
  if (!name.trim()) { console.error('case add: name required'); return Promise.resolve(1); }
  const url = parseUrl(opts.url);
  if (!url.ok) { console.error(url.error); return Promise.resolve(1); }
  return withKernel(async (kernel) => {
    const svc = kernel.resolve(EP.CaseService);
    if (svc.isErr()) { console.error(svc.error.message); return 1; }
    const target: TargetSpec = { kind: 'web', url: url.url };
    const r = await svc.value.create({ name, target, tags: opts.tags ? opts.tags.split(',').map((t) => t.trim()).filter(Boolean) : [] });
    if (r.isErr()) { console.error(r.error.message); return 1; }
    console.log(`✓ case created: ${r.value.id}  (${r.value.name} → ${url.url})`);
    return 0;
  });
}

export function caseList(json: boolean): Promise<number> {
  return withKernel(async (kernel) => {
    const svc = kernel.resolve(EP.CaseService);
    if (svc.isErr()) { console.error(svc.error.message); return 1; }
    const r = await svc.value.list();
    if (r.isErr()) { console.error(r.error.message); return 1; }
    if (json) { console.log(JSON.stringify(r.value.rows, null, 2)); return 0; }
    if (r.value.rows.length === 0) { console.log('(no cases — add one with `domia case add`)'); return 0; }
    for (const c of r.value.rows) {
      const t = c.target.kind === 'web' ? c.target.url : c.target.kind;
      console.log(`${c.id}  ${c.name.padEnd(24)} ${t}${c.tags.length ? '  [' + c.tags.join(',') + ']' : ''}`);
    }
    return 0;
  });
}

/**
 * Mount an MCP server onto a case — the swappable capability seam (E1).
 * crawl4ai:  domia case mount <id> --name crawl4ai --sse http://localhost:11235/mcp/sse
 * github:    domia case mount <id> --name github --stdio "npx -y @modelcontextprotocol/server-github"
 * Swapping crawl4ai for another crawler is a mount change — no Domia code.
 */
export function caseMount(id: string, opts: { name: string; sse?: string; http?: string; stdio?: string; risk?: string }): Promise<number> {
  if (!opts.name?.trim()) { console.error('case mount: --name required'); return Promise.resolve(1); }
  const transports = [opts.sse, opts.http, opts.stdio].filter(Boolean);
  if (transports.length !== 1) { console.error('case mount: pass exactly one of --sse <url> | --http <url> | --stdio "<command args>"'); return Promise.resolve(1); }

  return withKernel(async (kernel) => {
    const svc = kernel.resolve(EP.CaseService);
    if (svc.isErr()) { console.error(svc.error.message); return 1; }
    const got = await svc.value.get(id as CaseId);
    if (got.isErr() || !got.value) { console.error(`case '${id}' not found`); return 1; }

    const risk = opts.risk ? { risk: opts.risk as NonNullable<McpMount['risk']> } : {};
    let mount: McpMount;
    if (opts.stdio) {
      const parts = opts.stdio.split(/\s+/).filter(Boolean);
      const command = parts[0];
      if (!command) { console.error('case mount: --stdio needs a command'); return 1; }
      mount = { name: opts.name, transport: 'stdio', command, args: parts.slice(1), ...risk };
    } else {
      mount = { name: opts.name, transport: 'http', url: (opts.sse ?? opts.http) as string, ...risk };
    }

    const existing = got.value.assets.mcpServers ?? [];
    const mcpServers = [...existing.filter((m) => m.name !== mount.name), mount];
    const upd = await svc.value.update(id as CaseId, { assets: { ...got.value.assets, mcpServers } });
    if (upd.isErr()) { console.error(upd.error.message); return 1; }
    console.log(`✓ mounted '${mount.name}' on case ${id} (${mount.transport}${mount.url ? ' ' + mount.url : ' ' + mount.command})`);
    console.log(`  its tools appear to the agent as ${mount.name}.*`);
    return 0;
  });
}

export function caseShow(id: string, json: boolean): Promise<number> {
  return withKernel(async (kernel) => {
    const svc = kernel.resolve(EP.CaseService);
    if (svc.isErr()) { console.error(svc.error.message); return 1; }
    const r = await svc.value.get(id as CaseId);
    if (r.isErr()) { console.error(r.error.message); return 1; }
    if (!r.value) { console.error(`case '${id}' not found`); return 1; }
    console.log(json ? JSON.stringify(r.value, null, 2) : `${r.value.name}\n  id: ${r.value.id}\n  target: ${JSON.stringify(r.value.target)}\n  tags: ${r.value.tags.join(', ') || '(none)'}`);
    return 0;
  });
}
