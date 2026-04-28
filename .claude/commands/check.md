---
description: Run all CI gates and report. Use after any non-trivial code change before claiming done.
---

Run, in order, and report the results compactly:

1. `npx tsc --noEmit` — must show 0 errors.
2. `npm run check:architecture` — must say "Architecture guardrails passed".
3. `npx knip` — review the output. Polymorphic false positives (`DomainError`, `PreparedRunSession`, `PerceptionOptions`) are already in `knip.json` ignore. Anything else is real dead code or a new false positive that needs addressing.

If any step fails, fix it before reporting done. Do not claim a task is complete without all three passing.
