# @domia/domia-mcp — Interface Spec

**Purpose.** Domia exposed **as** an MCP server (E6/J10). Any MCP host (Claude
Code, Codex CLI, another Domia) mounts it and drives Domia as a tool. Symmetric to
`McpToolProvider`, which *consumes* MCP.

**Kind.** Thin MCP server over the `DomiaApi` facade.

---

## Exposed MCP tools

| MCP tool | Maps to | Contract |
|---|---|---|
| `domia_run_start {caseId, request, options?}` | `api.runs.start` | returns `{runId}` **immediately** — never blocks on a long run |
| `domia_run_status {runId}` | `api.runs.get` | status, last turns, plan snapshot, cost |
| `domia_run_answer {runId, reply}` | `api.runs.answer` | resolve a waiting run (rare over MCP) |
| `domia_case_list {}` | `api.cases.list` | pick a target |
| `domia_trace_timeline {runId}` | `api.traces.timeline` | audit a completed run |

## Internal classes

| Class | File | Responsibility |
|---|---|---|
| `DomiaMcpServer` | `server.ts` | MCP SDK server over a `DomiaApi`; registers the five tools (schemas inline); long ops return a runId, host polls status (never blocks) |
| `createDomiaMcpServer` / `serveStdio` | `index.ts` | bind an api (pass `interactive:false` so runs stay unattended); `serveStdio` connects a `StdioServerTransport` — the entry a host spawns |

## Design notes

- **Non-blocking by contract** (D12 kin): `domia_run_start` returns a runId; the
  host polls `domia_run_status` or subscribes. A run needing a human auto-suspends
  (interactive=false) and surfaces in status.
- **Facade projection only** — no logic; if `DomiaApi` grows, regenerate tool defs.
- **Symmetry** is the point: Domia both consumes (J6) and serves (J10) MCP, so it
  slots into any agent mesh without special glue.

## File manifest

```
domia-mcp/
  package.json
  src/ server.ts index.ts
```
