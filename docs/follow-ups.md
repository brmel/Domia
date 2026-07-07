# Follow-ups — open work

Verified state (2026-07-06): dependencies install, `tsc` is at 0 errors, `check:architecture` passes,
the full vitest suite is green, and `knip` reports no unused files/deps. Everything from the old
blocked-registry era is done or obsolete; what remains is below.

## Agent quality

- [ ] **Default model rarely acts** — `DEFAULT_LLM_MODEL = 'gemini-2.0-flash'` observes and calls `finish` with 0 interaction actions even for imperative goals ("click the button"), and reports success on unsatisfiable goals. Loop/tooling is correct; the model is weak. Evaluate bumping the default to a stronger Gemini and/or a prompt nudge that requires an interaction before `finish` when the goal is imperative. **M**

## Tests to add

- [ ] **Budget enforcement** — drive `RunBudgetPolicyService` / the runtime to a small `maxActions`/`maxTokens`/`maxDurationMs` and assert the run stops with `budget_exhausted`. **M**
- [ ] **`TraceService` + `RunTraceWriter`** — assert one TracerProvider is installed and a per-run `trace.jsonl` is written (real `FileSystemStorage` over a tmp dir, no OTLP collector). **M**
- [ ] **Electron `switch_window` 2-window case** — open a second page over CDP, switch, assert the interaction lands on the new window. **M**
- [ ] **Integrated `RunUseCase` e2e** — needs a recorded LLM replay fixture; run the full orchestrator once deterministically. **L**
- [ ] **De-mock the workflow tests** — `workflow-execution.test.ts` still uses `vi.fn()` + Map fakes; rewire to the real `SQLiteWorkflowRepository` + `createInMemoryDb()` (pattern in `run-resume.test.ts`). **M**

## Robustness

- [ ] **`PlaywrightStream` hooks on window switch** — console/network/pageerror hooks don't migrate on a mid-stream Electron window switch; verify whether that happens in practice, re-attach if so. **M**
- [ ] **`.db.bak` restore path** — the crash-safety backup is write-only; add a "load `.bak` if `.db` is corrupt" path or document manual recovery. **S**
- [ ] **Versioned JSON blobs** — `state_json` / `steps_json` / `platform_config_json` have no schema-version tag; add a version + Zod validation on read (matters most for resume rehydration). **M**

## Mobile (Appium)

- [ ] **Device-gated mobile e2e** — `DOMIA_MOBILE_DEVICE`-gated run against an emulator/device. **L**
- [ ] **Replace the regex XML parse** in `AppiumPerceptionSource` with a real parser (e.g. `fast-xml-parser`). **M**
- [ ] **`getViewportSize()` returns `null`** on the Appium source — wire to the real device viewport when a tool needs it. **S**

## Frontend

- [ ] **`react-json-view`** (`JsonTreeView.tsx`) — unmaintained, React-18 peer warnings; replace with a maintained tree view or a small custom one. **M**
