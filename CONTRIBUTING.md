# DOMIA V2 — Modular Redesign

A from-scratch redesign of Domia as a set of independent modules with MIL-style
(Matrox Imaging Library) **Context / Execute / Result** APIs, connected only through
a small kernel and a shared contracts package — around **one agentic loop**: no
hardcoded steps, no phases, no user-authored workflows. The agent owns task
structure; the system owns lifetimes, mediation, and provenance.

**▶ Installing a build: [INSTALL.md](../INSTALL.md)** — dmg / exe / AppImage / CLI
tarball, the one-time unsigned-app step per OS, keys, and where your data lives.
**▶ Working in the repo: [QUICKSTART.md](./QUICKSTART.md)** — dev install, keys, first
autonomous run, mounting MCP tool servers (crawl4ai, github, …).

Build it yourself: `npm run package` → `dist/domia.mjs` (self-contained CLI) and
`packages/hosts/desktop/release/` (app + installers). CI (`.github/workflows/`) runs
the same `npm run check` on every push and cuts a release from a `v*` tag.

This is a **living monorepo** — the backend + desktop app are built and tested
(`packages/*`), alongside the design docs that are its contract. The previous V1
app was retired after a parity audit (`packages/DECISIONS.md` D33–D36). **DOMIA runs
single-host** (one process; distribution is deferred, see DESIGN §17). Build/slice
state: `packages/DECISIONS.md`. The documents:

- **[docs/DESIGN.md](./docs/DESIGN.md)** — the architecture story: V1 autopsy, design
  philosophy, the agentic research + decision (§4), module map, connections,
  user journeys with data flow, data model, roadmap.
- **[docs/MODULES.md](./docs/MODULES.md)** — the API reference: every module's functions,
  contexts vs results, sync vs async, journeys, implementation notes, file trees.

The **[packages/](./packages/)** folder is the physical scaffold: one
`INTERFACE.md` per package with authoritative TypeScript signatures + file
manifest, plus **[packages/DECISIONS.md](./packages/DECISIONS.md)** (D1–D12 —
design problems found while specifying interfaces, and their fixes; these refine
the contracts in DESIGN/MODULES where they conflict) and
**[packages/WORKSPACE.md](./packages/WORKSPACE.md)** (root build config).
Persona prompts (behavior, not code) live in **[prompts/personas/](./prompts/personas/)**.

## The system in one picture

```
          ┌──────────────┐   ┌────────────┐   ┌──────────────┐
          │   UI (12)    │   │  CLI (13)  │   │ domia-mcp    │
          │Electron+React│   │ commander  │   │ (MCP server) │
          └───────┬──────┘   └─────┬──────┘   └──────┬───────┘
                  │      DomiaApi (typed)            │
          ┌───────┴─────────────────────────────────┴───────┐
          │                 API Facade (11)                 │
          │        use-cases + queries + RunRegistry        │
          └──┬────────┬──────────┬──────────┬────────┬──────┘
             │        │          │          │        │
        ┌────┴───┐ ┌──┴─────────┐│      ┌───┴───┐ ┌──┴────┐
        │Case (7)│ │  Loop (10) ││      │Trace  │ │Store  │
        │        │ │ THE loop + ││      │ (3)   │ │ (4)   │
        └────┬───┘ │ meta belt: ││      └───┬───┘ └──┬────┘
             │     │ user.ask · ││          │        │
             │     │ takeover ·  ││         │        │
             │     │ spawn/await ││         │        │
             │     │ handoff ·   ││         │        │
             │     │ skills      ││         │        │
             │     └─┬───┬───┬──┬┘│         │        │
             │  ┌────┘   │   │  └─┴───┐     │        │
        ┌────┴──┐ ┌──────┴┐ ┌┴──────┐ ┌────┴───┐    │
        │ Agent │ │ Tools │ │ Plan  │ │ Memory │    │
        │  (6)  │ │  (5)  │ │  (8)  │ │  (9)   │    │
        │ AI SDK│ │ MCP · │ │ living│ │ md +   │    │
        │ 25+   │ │ pw-mcp│ │ plan +│ │memory.*│    │
        │ replay│ │capture│ │plan.* │ │ tools  │    │
        └───────┘ │os-a11y│ └───────┘ └────────┘    │
                  │vision │                          │
                  │shell  │                          │
                  └───────┘                          │
        ┌────────────────────────────────────────────┴───┐
        │   Kernel (2): registry · events · config · log  │
        │   Contracts (1): types · schemas · errors       │
        └─────────────────────────────────────────────────┘
        one host process · trace-first load · no distribution (§17)
```

## Module list

| # | Package | One-line responsibility |
|---|---------|-------------------------|
| 1 | `@domia/contracts` | Shared types, Zod schemas, error catalog, base Context/Outcome contracts |
| 2 | `@domia/kernel` | Module registry, lifecycle, event bus, config, logging |
| 3 | `@domia/trace` | Spans, events, artifacts (screenshots/video), sinks, replay source |
| 4 | `@domia/store` | SQLite persistence engine + repositories |
| 5 | `@domia/tools` | Tool providers behind one `TargetSession`: **MCP/playwright-mcp** (default browser), capture, os-a11y, vision, shell, files, skills |
| 6 | `@domia/agent` | Propose-only `AgentContext` over one **`AiSdkProvider`** (Vercel AI SDK, 25+ models) + `replay` |
| 7 | `@domia/case` | Case entity: target + auth + assets (incl. MCP mounts); CaseContext allocation |
| 8 | `@domia/plan` | The living plan: agent-generated items, revisions, `plan.*` tools |
| 9 | `@domia/memory` | Per-case markdown memories + `memory.*` tools; selective injection at run start |
| 10 | `@domia/loop` | The agentic harness: ONE loop, meta-tool belt, personas, gates, informants |
| 11 | `@domia/api` | The single facade UI/CLI/`domia-mcp` talk to (+ RunRegistry of live runs) |
| 12 | `@domia/ui` | React renderer |
| 13 | `@domia/cli` | Command-line surface |
| — | `@domia/domia-mcp` | Domia exposed **as** an MCP server (drive it from any MCP host) |
| — | `@domia/desktop`, `@domia/headless` | Hosts that compose the kernel (single process) |
| — | `@domia/conformance` | Executable provider test kits (no mocks) |

## Golden rules (short form)

1. Modules come in three kinds: **K1 service** (stateless async fns), **K2
   factory** (`alloc(config) → Context`, `execute → Outcome`, `dispose` — tools,
   agent, case, plan, loop), **K3 provider** (impls behind extension points).
   The MIL triad is enforced where live state exists, never forced where it doesn't
   (DESIGN §3).
2. Modules import **only** `@domia/contracts` + `@domia/kernel`. Never each other's
   internals.
3. **Maximally agentic.** No hardcoded steps, phases, stages, or plans — anywhere.
   The agent decomposes, explores, recovers, asks, delegates, and re-plans through
   its tool belt (`plan.*`, `user.ask`, `agent.spawn/await`, `context.handoff`,
   `skill.*`, `suspend`). Behavior lives in persona prompts, not code (DESIGN §4).
4. The harness is deterministic where it must be: routing, tracing, persistence,
   gates (pause/cancel/answer — user authority), informants (signals, never
   vetoes). The only hard stop is the user's cancel.
5. The Loop mediates **every** agent↔tool exchange. No LLM SDK ever executes a
   tool itself.
6. Everything observable: every alloc, exchange, call, plan revision, and spawn
   flows through `@domia/trace`.
7. Providers are plugins behind one interface per module (tools, agents,
   meta-tools, sinks). Built-ins use the same extension points as third parties.
8. No mocks in tests — provider conformance kits + replay agent + real targets.
