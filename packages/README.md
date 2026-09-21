# Packages

Domia is an npm workspace. Each folder here is one package with a single job, and
each carries an `INTERFACE.md` describing what it exposes. Packages talk to each
other only through `contracts` and the references the kernel hands out, so any one
of them can be read — or replaced — on its own.

| Package | What it does |
|---|---|
| `contracts` | The shared language: ids, error codes and the base types every other package speaks. |
| `kernel` | Starts the process. Loads packages in dependency order and hands out the references they ask for. |
| `trace` | Records what happened — the span tree, events, artifacts and what the run cost. |
| `store` | The only package that knows SQL. SQLite, write-ahead logging, foreign keys enforced. |
| `tools` | Everything the agent can *do* to a target: read the page, click, type, take a screenshot. |
| `agent` | The model socket. One interface over any LLM provider, so swapping models is configuration. |
| `case` | A saved target: how to reach it, how to sign in, and what data it is allowed to use. |
| `plan` | The task plan the agent writes and revises as it works. Data and tools, never an engine. |
| `memory` | What the agent learned on earlier runs against the same target. |
| `loop` | The harness: observe, choose an action, act, look at what changed, repeat. |
| `audit` | The deterministic pass — findings from files, headers and HTML, with no model involved. |
| `skills` | Reusable skill folders the agent can load for a particular kind of work. |
| `api` | The one interface the UI, the CLI and the MCP server all call. |
| `ui` | The React front end. Consumes the API type and nothing else. |
| `cli` | The terminal front end, over the same API. |
| `domia-mcp` | Domia exposed as an MCP server, so another agent can drive it. |
| `conformance` | Executable specs that every provider implementation has to pass. |
| `hosts/` | The two ways to boot the system: `desktop` (Electron) and `headless`. |

## Reading order

Dependencies run bottom-up, so the packages read most easily in that order:

```
contracts → kernel → trace → store → {tools, agent, case, plan, memory}
          → loop → api → {ui, cli} → hosts → domia-mcp
```

Design problems found along the way, and how each was fixed, are in
[DECISIONS.md](./DECISIONS.md). The architecture is in
[../docs/DESIGN.md](../docs/DESIGN.md).
