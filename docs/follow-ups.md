# Follow-ups — deferred work (do once `npm install` works)

This branch (`feat/agentic-capability`) was built with **dependencies un-installable**
(Artifactory `403 Forbidden` on `kysely`), so nothing was compiled or tested. Every
change passed `npm run check:architecture` (a zero-dependency script) and careful review,
but **no `tsc`, `vitest`, `knip`, or app run happened.** This file lists everything left
to do once the registry is reachable.

Legend: **[risk]** = how likely it needs a fix when you compile/run · effort S/M/L.

---

## 0. First: unblock + verify (do before anything else)

- [ ] **Fix the registry / install deps.** Whitelist `kysely` (and any other blocked pkgs) in Artifactory, or use a working npm auth/registry. Then `npm install`.
- [ ] **Regenerate `package-lock.json`.** Commit `241ea9e` removed 11 unused deps from `package.json` but the lockfile couldn't be updated here. `npm install` reconciles it; commit the lock change. (Until then `npm ci` will fail.)
- [ ] **Run the gates:** `npx tsc --noEmit` → `npm run check:architecture` → `npm run lint` → `npm run test` → `npx knip`. Treat everything below labeled "unverified" as suspect until these pass.

## 1. Most likely to need a tweak once `tsc` runs  **[high]**

These touch library typings I couldn't verify against `node_modules`:

- [ ] **`withLlmRetry`** (`infrastructure/agent-runtime/adk/withLlmRetry.ts`) — reassigns `llm.generateContentAsync` via a cast. Confirm the cast matches `@google/adk`'s real `BaseLlm.generateContentAsync` signature. **S**
- [ ] **`thinkingConfig`** in `assembleAdkSession.ts` `generateContentConfig` — confirm `@google/genai` accepts `{ includeThoughts, thinkingBudget }` in that shape. **S**
- [ ] **Test constructor updates** — confirm `new AdkAgentRuntime(...12 args)` (vision-multimodal + conversation-snapshot tests), `new GeminiLlmFactory(new ExponentialBackoffRetryPolicy())`, and the `TraceService` arg all type-check after the default-removal in `b99f93f`. **S**
- [ ] **Corrupt-row test** (`tests/e2e/persistence/sqlite-persistence.test.ts`, "corrupt-row reads") — confirm `raw.run(sql, params)` inserts run + asserts `Err`. **S**
- [ ] **`escapeAdkState`** (`shared/reliability/interpolate.ts`) — uses a zero-width-space; confirm it renders/serializes as intended. **S**

## 2. Tests to add (behavioral coverage gaps)  **[medium]**

The refactors added features that have **no behavioral test**:

- [ ] **Budget enforcement** — drive `RunBudgetPolicyService` / the runtime to a small `maxActions`/`maxTokens`/`maxDurationMs` and assert the run stops with `budget_exhausted`. (Pure-ish, no LLM.) **M**
- [ ] **`TraceService` + `RunTraceWriter`** — assert one TracerProvider is installed and a per-run `trace.jsonl` is written with the expected lines (real `FileSystemStorage` over a tmp dir, no OTLP collector). **M**
- [ ] **Electron `switch_window`** — add a 2-window CDP case to `tests/e2e/tools/electron-tools.test.ts`: open a second page, switch, assert an interaction/extract lands on the **new** window (proves the lazy-perception fix `83ba394`). **M**
- [ ] **Integrated `RunUseCase` e2e** (the deferred W8) — needs a recorded LLM replay fixture (record against a live LLM, like `tests/fixtures/llm-recordings/vision-multimodal.json`), then run the full orchestrator once deterministically. **L** (blocked on a live LLM run)
- [ ] **Gated planner/evaluator** — assert `DOMIA_PLANNER` / `DOMIA_EVALUATOR` toggle behavior + safe fallback. **M**
- [ ] **De-mock the workflow tests** — `tests/e2e/workflow/workflow-execution.test.ts` + `workflow-lifecycle.test.ts` use `vi.fn()` + Map fakes; rewire to the real `SQLiteWorkflowRepository` + `createInMemoryDb()` and a plain `fakeRuntime` (the pattern in `run-resume.test.ts`). Restores the "no mocks" rule. **M**

## 3. Code follow-ups (subtractive / refactor, not blocking)  **[low–medium]**

- [ ] **Narrow `IRetryPolicy`** — the live path (`withLlmRetry`) uses only `maxAttempts` + `delayMs`; `execute()` / `isRetryable()` are exercised only by `retry-policy.test.ts`. Drop them from the port + impl and re-point the test at `delayMs`/`withLlmRetry`. **S**
- [ ] **Wire `step.persisted` (per-step trace)** — currently `RunTraceWriter` records run-level events only. To get per-step lines: inject `IEventBus` into `StepExecutionKernelService`, emit `step.persisted` after `saveStep`, re-add the `DomainEvents` entry + the `EventLogger`/`RunTraceWriter` handlers (removed in `0a148fc`). Needs a kernel constructor change + `run-resume.test.ts` update. **M**
- [ ] **`react-json-view`** (`frontend/.../JsonTreeView.tsx`) — unmaintained, React-18 peer warnings. Replace with a maintained tree view (or a small custom one). **M**
- [ ] **Dedupe `sleep()`** — `shared/reliability/retry.ts` has a private `sleep` duplicating `shared/reliability/sleep.ts`; import the shared one. **S**
- [ ] **Rename `RoleRefResolver.ts`** (`infrastructure/playwright/perception/`) — it only exports `buildRoleSnapshot`; the ref→Locator resolution lives in `PlaywrightAdapter.resolveRef`. Rename to `RoleSnapshotBuilder.ts` and fix the stale description in `.claude/skills/playwright.md` (~line 41). **S**
- [ ] **`ElectronWindowManager.setActiveWindow`** — now only called internally by `switchWindow`; make it `private` (or inline). **S**
- [ ] **`getActiveWindow()` side-effect** (`ElectronWindowManager`) — it mutates `activeWindowId` inside a getter (first-window fallback). Consider making the fallback explicit. **S**
- [ ] **`IShellPolicy` location** — sits under `domain/ports/automation/` but is shell/system-control; consider a `system`/`shell` port group. Low priority, no behavior impact. **S**

## 4. Robustness / correctness to revisit  **[low]**

- [ ] **`PlaywrightStream` hooks on window switch** — `console`/`network`/`pageerror` hooks attach to the page at `start()`/`setProfile()` and only re-attach on a profile change; a mid-stream Electron window switch won't migrate them (screenshots do follow via the lazy `getPage`). Verify whether the loop switches windows while a stream profile is active; if so, re-attach hooks on switch. **M**
- [ ] **`.db.bak` is write-only** (`SqlJsProvider.saveDatabase`) — the crash-safety backup has no restore path. Either add a "load `.bak` if `.db` is corrupt" path or document it as manual-recovery-only. **S**
- [ ] **Versioned JSON blobs** (original W18 item, not done) — `state_json` / `steps_json` / `platform_config_json` are `JSON.parse`'d with no schema-version tag; a stored shape predating a domain-type change parses into a malformed object. Add a version tag + Zod validation on read (most important for the blobs resume rehydrates from). **M**

## 5. Mobile (Appium) — finish the platform  **[medium, needs a device]**

- [ ] **Device-gated mobile e2e** — the Appium perception source + sampler (`infrastructure/appium/`) are implemented but only the XML-parser has an offline test. Add a `DOMIA_MOBILE_DEVICE`-gated e2e (emulator/device) that drives a real mobile run. **L**
- [ ] **`AppiumPerceptionSource` XML parser** — currently a dependency-free **regex** parse (fragile). Once deps install, replace with a real XML parser (e.g. `fast-xml-parser`). **M**
- [ ] **`getViewportSize()` returns `null`** on the Appium source — wire it to the real device viewport if any tool needs it. **S**

---

## Notes

- The **architecture gate** (`scripts/check-architecture.mjs`) passed after every commit, so layer boundaries, cycles, and the fat-constructor cap are intact — it just can't see type errors or runtime behavior.
- `domain/enums.ts` uses TS `enum` (ActionType/RunState/LogLevel). This is the **sanctioned exception** per `CLAUDE.md` (enums.ts is the designated enum home), not a violation — leave it unless you decide to convert (high blast radius for `ActionType`).
- One pass-3 inspector wrongly flagged `DEFAULT_LLM_PROVIDER` as unused; it **is** used by the config Zod schema (`shared/contracts/config.ts`) and was kept. Re-verify with `knip` before trusting any "unused" claim.
