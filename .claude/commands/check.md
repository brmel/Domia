---
description: Run the CI gates and report. Use after any non-trivial change before claiming done.
---

Run, in order, and report compactly:

1. `npx tsc --noEmit` — must be 0 errors.
2. `npm run check:architecture` — must say "Architecture guardrails passed".
3. `npm run lint` — must be clean.
4. `npx knip` — dead-code/dep audit. Known polymorphic false positives are already in `knip.json`'s ignore list; anything new is real or a new false positive to address.

Steps 3–4 (and any test run) need `node_modules` installed. The first two are the minimum "done" gate. Fix any failure before reporting done — don't claim complete without the core gates passing.
