---
description: Summarize current architecture state + how-to from docs/ARCHITECTURE.md.
---

Read `docs/ARCHITECTURE.md` and report concisely:

1. **Layers & boundaries** — the layer ownership table + the CI-gated guards.
2. **Subsystems** — the at-a-glance map (agent runtime, automation, tools, perception, persistence, observability, CLI/desktop).
3. **Current state** — the "Current state" section: what's healthy + the known open lever (layer-first organization).
4. **Last completed** — from `git log` (recent `feat`/`fix`/`refactor` commits), since history is not kept in a tracked changelog.

`docs/ARCHITECTURE.md` is the source of truth for "what state is the codebase in." Run `npm run check:architecture` + `npx tsc --noEmit` to confirm gates.
