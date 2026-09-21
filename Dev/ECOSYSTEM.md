# Ecosystem Analysis — What Exists, What We Adopt, Why

> Searched July 2026. Question: which existing GitHub systems should DOMIA V2
> **use** instead of build — protocols (MCP, Agent Skills), servers
> (playwright-mcp, reference MCP servers), libraries (Vercel AI SDK, Stagehand)?
> Verdicts E1–E9 update DESIGN/MODULES/PLAN. Sources at bottom.

Build-vs-adopt rule: adopt where the ecosystem gives leverage **without**
touching the three things that ARE the product — the mediated loop, the trace,
and agent freedom. Everything else is replaceable plumbing.

---

## 1. Protocols

### E1 — MCP (Model Context Protocol) → **ADOPT, both directions**

State 2026: default integration layer industry-wide (OpenAI, Google DeepMind,
Microsoft adopted; AWS/Google/Microsoft/Cloudflare platinum members of the
Agentic AI Foundation). 5,800+ community servers, official registry + mcp.so
(17k+), SDKs at ~97M monthly downloads; TypeScript SDK first-class.

**How we use it (inbound).** New K3 impl in `@domia/tools`: **`McpToolProvider`**
— connects/spawns an MCP server (stdio or HTTP), lists its tools, maps them to
`ToolManifest`s (JSON Schema → Zod), dispatches `invoke` through the SAME session
middleware (validate → span → informants → capture → record). Cases declare
mounts:

```jsonc
// Case.assets.mcpServers
[{ "name": "github", "transport": "stdio", "command": "npx @modelcontextprotocol/server-github",
   "env": { "GITHUB_TOKEN": "secret://gh-token" }, "risk": "guarded" }]
```

Server processes are kernel-tracked contexts (alloc at session start, dispose at
end — leak-proof like everything else). Mounted tools default `risk: 'guarded'`,
sit under case tool policy (R6) and approvals.

**Why it works for us:** one adapter = 5,800 integrations (GitHub, Slack, Notion,
Postgres, company-internal servers) without writing providers. Our
`ToolProvider` interface is already manifest+invoke — MCP is the same shape.

**How we use it (outbound, E6).** `domia-mcp`: a thin MCP server exposing
`domia_run_start`, `domia_run_status`, `domia_case_list`, `domia_trace_timeline`
over the api facade. Any MCP host (Claude Code, Codex CLI, another Domia) can
drive Domia as a tool. Slice 9.

### E4 — Agent Skills (SKILL.md) → **ADOPT the spec verbatim**

Anthropic-originated, now an open standard (agentskills.io) adopted by Claude
Code, Codex CLI, Gemini CLI, GitHub Copilot, Cursor, Cline, OpenCode. A skill =
folder with `SKILL.md` (frontmatter: name, description; body: instructions) +
optional `scripts/`, `references/`, `assets/`. **Progressive disclosure**:
metadata always in context, full body loaded only when the task matches — the
same selective-injection lesson OpenClaw taught (R4).

**Delta to R4:** our skills folder becomes spec-compliant (`prompts/skills/
<name>/SKILL.md`), so skills are portable in both directions with the whole
ecosystem. Domia adds one extension the spec allows: an optional
`recording.json` asset that our `SkillPlayer` can replay as a deterministic
action sequence.

### A2A (agent-to-agent) → **PARK**

Cross-vendor agent federation. Our `agent.spawn` is in-process; `domia-mcp`
covers external callers. Revisit when a real second agent appears.

---

## 2. Tool servers

### E2 — microsoft/playwright-mcp → **ADOPT as the default browser provider**

The official Playwright MCP server: 40+ tools (navigate, click, type, fill,
select, hover, drag, tabs, upload, download, dialogs, network, **tracing,
video**), **accessibility snapshots with `ref=eN` element references** — exactly
the observation/acting model DESIGN §10 specifies — plus `--storage-state`
(our case auth), `--cdp-endpoint` (attach to a running app), and optional
`vision`/`pdf`/`devtools` capabilities.

**Decision.** Building our own Playwright provider would re-implement this
tool-for-tool. Instead:

- `McpToolProvider` mounts playwright-mcp as the **web** provider
  (storage-state from `CaseContext`, one server per `TargetSession` — session
  hygiene preserved).
- **Electron**: a small `TargetLauncher` in `@domia/tools` spawns the app with
  `--remote-debugging-port`, then playwright-mcp attaches via `--cdp-endpoint`.
  Launch stays ours; driving is MCP.
- Our invoke middleware still wraps every call — trace spans, artifacts,
  recording, informants are untouched.
- `PlaywrightDirectProvider` (the hand-written one in PLAN 2.5) is **parked**:
  build only if playwright-mcp blocks something real (custom per-action capture
  hooks, exotic Electron control). The interface seam makes the swap invisible.

**Why it works:** Microsoft maintains browser churn for us; ref-based ARIA
acting arrives battle-tested; we keep every deep-integration property because
mediation lives above the provider, not inside it.

### E5 — Reference + community MCP servers → **OPTIONAL MOUNTS**

`modelcontextprotocol/servers` reference set (filesystem, fetch, git, memory,
sequential-thinking) + community (github, slack, notion, postgres,
desktop-commander, apple-mcp). Usable per case via E1 with zero Domia code.
Our own `files` provider stays (workdir-sandboxed — tighter than the generic
filesystem server); mounts are additive capability, governed by tool policy.

---

## 3. Libraries

### E3 — Vercel AI SDK → **ADOPT as the agent provider layer**

TypeScript, provider-neutral: one API over 25+ providers (OpenAI, Anthropic,
Google, Bedrock, Azure, Mistral, xAI; Ollama via community provider /
openai-compatible). v6 ships `ToolLoopAgent` and stable MCP client support;
tool definitions support provider-level options (e.g. Anthropic tool caching).

**How we use it.** Inside `@domia/agent`, ONE **`AiSdkProvider`** replaces the
four hand-written adapters (gemini/claude/openai-compat/ollama): it calls
`generateText`/`streamText` per `step()` with tools declared **without execute
functions** — the SDK then returns tool calls instead of running them, which is
precisely our propose-only contract. Model routing/failover (R7) becomes model
registry configuration.

**What we do NOT use:** its `ToolLoopAgent` loop. The loop is the product
(mediation, gates, informants, trace) — the SDK is transport. `ReplayProvider`
stays ours. `SdkLoopBridge` remains for SDKs that insist on owning the loop.

**Why:** provider quirks (schemas, streaming, retries-per-vendor) are exactly
the undifferentiated code V1 drowned in. One adapter, 25 providers, and the
propose-only seam holds.

### E8 — Stagehand (Browserbase) → **PATTERN, optional later**

TS browser automation with `act()` / `observe()` / `extract()` — natural-language
actions compiled to Playwright. Validates our observe/act split. A future
`stagehand` ToolProvider could offer `browser.act {instruction}` as a
higher-level tool for hostile pages; parked — playwright-mcp refs first,
`vision.locate` (R1) covers the gap.

### E9 — Others (assessed during the July 2026 landscape review)

browser-use (patterns; python), UI-TARS (pixel grounding — only informs
`vision.locate`), nut-js alternatives (native input, licensing check open),
mem0/Letta (heavier memory — our md memory first, provider seam later),
E2B/Scrapybara/cua (VM targets — future `TargetSpec` kind).

---

## 4. Agent harnesses — validation, not adoption

| Harness | What it proves | Why not adopt |
|---|---|---|
| Claude Agent SDK | loop + hooks + subagents + MCP — the harness shape we converged on | Claude-centric; our loop must stay provider-neutral and fully mediated |
| Google ADK | workflow vs LLM-driven split | V1 lesson: SDK owned the loop = trace/policy/replay pain |
| LangGraph / graphs | explicit state machines | graphs = predefined code paths = workflows; contradicts §4 |

Convergent evolution is the point: everyone's answer is "simple loop + tools +
harness". Ours differs only in being provider-neutral and MIL-disciplined.

---

## 5. Decision table + design deltas

| # | Verdict | Design delta |
|---|---|---|
| E1 | MCP inbound bridge | tools: `McpToolProvider`, `McpServerManager` (kernel-tracked); case: `assets.mcpServers`; risk default `guarded` |
| E2 | playwright-mcp = default browser provider | tools: `TargetLauncher` (electron spawn + CDP); `PlaywrightDirectProvider` parked |
| E3 | AI SDK = agent provider layer | agent: `AiSdkProvider` + `ModelRegistry` (replaces 4 adapters); failover = config |
| E4 | Agent Skills spec compliance | skills folder = SKILL.md standard + optional `recording.json` asset |
| E5 | Community MCP mounts | zero code — E1 covers |
| E6 | `domia-mcp` outbound server | new thin package `packages/domia-mcp` over the api facade (slice 9) |
| E7 | Harnesses: validate only | none |
| E8 | Stagehand pattern | none now |
| E9 | see RESEARCH-AGENTS R-series | already folded |

Net effect on PLAN: **fewer classes to write** (drop 4 LLM adapters + the
hand-written browser provider), one new bridge (`McpToolProvider` ≈ 200 lines),
and the ecosystem's 5,800 servers become case-level configuration.

---

## Sources

- [playwright-mcp repo](https://github.com/microsoft/playwright-mcp) · [Playwright MCP docs](https://playwright.dev/docs/getting-started-mcp)
- [MCP reference servers](https://github.com/modelcontextprotocol/servers) · [MCP org](https://github.com/modelcontextprotocol) · [MCP ecosystem 2026](https://www.mcp-conference.com/resources/mcp-ecosystem-2026) · [MCP for teams (WorkOS)](https://workos.com/blog/everything-your-team-needs-to-know-about-mcp-in-2026)
- [Vercel AI SDK repo](https://github.com/vercel/ai) · [AI SDK 6](https://vercel.com/blog/ai-sdk-6) · [AI SDK docs](https://ai-sdk.dev/docs/introduction)
- [Agent Skills standard](https://agentskills.io/home) · [spec repo](https://github.com/agentskills/agentskills) · [Anthropic: equipping agents with skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [Stagehand / Browserbase](https://github.com/browserbase/stagehand)
