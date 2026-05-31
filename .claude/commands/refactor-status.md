---
description: Read docs/architecture/audit.md and summarize current architecture state + next roadmap.
---

Read `docs/architecture/audit.md` and report concisely:

1. **Health** (§9 verdict — what's healthy vs the ranked real issues, and which are DONE vs OPEN).
2. **Key signals** (§1 size, §3 god files, §4 coupling, dead-code %).
3. **Next / roadmap** (§10 — remaining slices + the feature-first migration decision).
4. **Last completed** — from `git log` (the recent `refactor(...)`/`fix(...)` commits), since history is not kept in a tracked changelog.

`docs/architecture/audit.md` is the source of truth for "what state is the codebase in." Run `npm run check:architecture` + `npx tsc --noEmit` to confirm gates.
