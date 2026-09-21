# DOMIA V2 — Quickstart (macOS + Windows)

Single-host, no Docker required for the core. Everything below is verified working.

## 1. Prerequisites

| Requirement | Why | Check |
|---|---|---|
| **Node ≥ 22** | `node:sqlite` is built in (no native build, no `better-sqlite3` compile) | `node -v` |
| A model API key | Gemini, Claude, OpenAI, or any OpenAI-compatible endpoint | see step 3 |
| Chromium | what playwright-mcp drives | `npx playwright install chromium` (`doctor` checks it) |

Windows and macOS use the same commands. The browser is launched as
`node <resolved playwright-mcp cli>` — no `npx`/`.cmd` shim issues, and it works
from any working directory.

## 2. Install

```bash
cd Dev
npm install
```

## 3. Provide a model key

Either export it, or drop it in `.env` (gitignored):

```bash
# .env
GOOGLE_GENERATIVE_AI_API_KEY=...     # or GOOGLE_API_KEY / GEMINI_API_KEY
# ANTHROPIC_API_KEY=...              # alternative
# OPENAI_API_KEY=...                 # alternative
# OPENAI_COMPATIBLE_BASE_URL=...     # GitHub Models / Ollama / LM Studio / OpenRouter
```

A packaged install reads the same names from `~/.domia/.env` — see
[INSTALL.md](../INSTALL.md).

## 4. Verify the install

```bash
npx tsx packages/cli/src/index.ts doctor
```

Expected: `doctor: all green` — checks Node version, `node:sqlite`, platform,
playwright-mcp resolution, model key, data dirs, and that a span actually lands in
`trace.jsonl`.

## 5. First autonomous run

```bash
npx tsx packages/cli/src/index.ts run \
  "Click 'More information' and report the page title" \
  --url https://example.com
```

The agent observes the page (accessibility snapshot with `ref=` handles), acts by
ref, and reports. The run, its plan, spans and token cost are persisted to
`~/.domia/domia.db`.

Pass a failover chain when one provider may be rate-limited (R7):

```bash
npx tsx packages/cli/src/index.ts run "…" --url https://example.com \
  --model google:gemini-2.5-flash,openai:gpt-4o
```

```bash
npx tsx packages/cli/src/index.ts runs list        # history
npx tsx packages/cli/src/index.ts runs show <id>   # spans + report
npx tsx packages/cli/src/index.ts plan show <id>   # the agent's plan
```

## 6. Cases (reusable targets)

```bash
npx tsx packages/cli/src/index.ts case add "Billing portal" --url https://app.example.com
npx tsx packages/cli/src/index.ts case list
npx tsx packages/cli/src/index.ts run "export last month's invoices" --case <caseId>
```

## 7. Adding tools — MCP mounts (crawl4ai, github, …)

Capability is **configuration, not code**. Any MCP server can be mounted onto a
case; its tools appear to the agent namespaced as `<name>.*`, ride the same
invoke middleware (traced, policy-gated), and are swappable at any time.

### crawl4ai

crawl4ai's Docker server speaks MCP natively on `:11235`:

```bash
docker run -d -p 11235:11235 --name crawl4ai --shm-size=1g unclecode/crawl4ai:latest
npx tsx packages/cli/src/index.ts case mount <caseId> \
  --name crawl4ai --sse http://localhost:11235/mcp/sse
```

The agent now has `crawl4ai.md`, `crawl4ai.crawl`, `crawl4ai.html`,
`crawl4ai.screenshot` alongside `browser.*`.

### Other servers (stdio)

```bash
# GitHub
npx tsx packages/cli/src/index.ts case mount <caseId> \
  --name github --stdio "npx -y @modelcontextprotocol/server-github"

# Filesystem (verified working)
npx tsx packages/cli/src/index.ts case mount <caseId> \
  --name fs --stdio "npx -y @modelcontextprotocol/server-filesystem /tmp"
```

**Swapping crawl4ai** for firecrawl or another crawler is a `case mount` change —
no Domia code. That is the point of the seam: `ToolProvider` behind one
`TargetSession`, dispatched by tool ownership (see `ECOSYSTEM.md` E1/E2).

Transports supported: `--sse <url>`, `--http <url>` (streamable HTTP), and
`--stdio "<command args>"`. Mounts default to `risk: guarded`.

## 8. The desktop app, and shipping builds

```bash
npm run app                 # electron + react renderer, against the same ~/.domia
npm run build:cli           # dist/domia.mjs — self-contained CLI + prompts + spawned servers
npm run package:desktop     # packages/hosts/desktop/release/ — app, dmg, exe, AppImage
npm run package             # both
```

Builds are unsigned (no paid certificate); [INSTALL.md](../INSTALL.md) has the
one-time step each OS asks for.

## 9. Domia as a tool for another agent

```bash
npx tsx packages/cli/src/index.ts mcp     # serves Domia over stdio to any MCP host
```

Mount that command in Claude Code, Codex, or another Domia: the host gets
`domia_run_start` (returns a runId immediately), `domia_run_status`,
`domia_case_list`, `domia_trace_timeline`.

## 10. Troubleshooting

| Symptom | Fix |
|---|---|
| `node:sqlite unavailable` | Upgrade to Node 22+ (doctor reports this) |
| `model api key: none` | Export the key or add `.env`; re-run `doctor` |
| `failed to reach MCP server` | Is the mount running? For crawl4ai: `docker ps`, then curl `http://localhost:11235/mcp/schema` |
| `chromium: not installed` | `npx playwright install chromium` — the agent has nothing to drive without it |
| `ExperimentalWarning: SQLite` | Cosmetic (Node flags `node:sqlite` as experimental); safe to ignore |

## Where things live

- Runs / cases / plans / spans → `~/.domia/domia.db`
- Trace stream + artifacts → `~/.domia/artifacts/`
- Persona prompts (behavior, editable, no rebuild) → `prompts/personas/`
