# DOMIA V2 — Package Scaffold

The physical monorepo. Each folder is a workspace package; each `INTERFACE.md` is
the **authoritative interface spec** for that package — TypeScript signatures in
fenced blocks, ready to become `.ts`. No implementation code yet.

Design problems found while writing these specs, and their fixes, are logged in
**[DECISIONS.md](./DECISIONS.md)** (D1…). The higher-level docs live one level up
(`../DESIGN.md`, `../MODULES.md`, `../PLAN.md`, `../JOURNEYS.md`, `../ECOSYSTEM.md`).

## Workspace layout

```
Dev/
  package.json            # npm workspaces root (to be written at slice 0)
  tsconfig.base.json      # strict flags, path aliases @domia/*
  scripts/check-modules.mjs
  prompts/
    personas/{lead,explorer,verifier,reporter}.md
    skills/<name>/SKILL.md
  packages/
    contracts/  kernel/  trace/  store/
    tools/  agent/  case/  plan/  memory/  loop/  api/
    ui/  cli/
    hosts/desktop/  hosts/headless/
    domia-mcp/  conformance/
```

## Reading order

Bottom-up (dependency order): `contracts → kernel → trace → store →
{tools, agent, case, plan, memory} → loop → api → {ui, cli} → hosts → domia-mcp`.

## Package status

| Package | Kind | Spec | Depends on (runtime, via resolve) |
|---|---|---|---|
| contracts | types | ✅ built | — |
| kernel | root ctx | ✅ built | contracts |
| trace | K1+micro+K3 | ✅ built (jsonl) | contracts, kernel |
| store | K1+micro | ✅ built (node:sqlite) | contracts, kernel |
| tools | K2+K3 | ✅ built (playwright-mcp) | contracts, kernel, (trace via host) |
| agent | K2+K3 | ✅ built (AI SDK + replay) | contracts, kernel, (trace) |
| case | K1+K2 | ✅ built | contracts, kernel, (store via host) |
| plan | K2 | ✅ built | contracts, kernel, (store, trace) |
| memory | K1 | ✎ | contracts, kernel, (store) |
| loop | K2+K3 | ✅ built (engine/run + belt) | contracts, kernel, (all domain via host) |
| api | K1+registry | ✎ | contracts, kernel, (all domain) |
| ui | consumer | ✎ | contracts (DomiaApi type) |
| cli | consumer | ✅ doctor | contracts, hosts |
| hosts/desktop | root | ✎ | everything |
| hosts/headless | root | ✅ boot | everything |
| domia-mcp | server | ✎ | contracts, api |
| conformance | test kit | ✎ | contracts |

✅ = code built & passing gates · ✎ = interface specified only. Slices 0–5 built & green: contracts, kernel, trace-jsonl, hosts, cli; tools + playwright-mcp; agent (AI SDK propose-only + replay); loop — **first autonomous run works** (agent drives a real page to a goal). Found+fixed D13–D21. Distribution/worker packages are **deferred** (DESIGN §17) — single-host only for now.
