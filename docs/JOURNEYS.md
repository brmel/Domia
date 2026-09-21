# DOMIA V2 — User Journeys (deep iteration)

> Every journey walked end to end: **who / trigger → what they see → the call
> chain → data written → why it works → where it breaks and how it recovers.**
> This is the validation instrument — if a journey can't be walked cleanly, the
> design is wrong. Findings feed back as F-items ([DESIGN §8](./DESIGN.md)).
> Reflects the ecosystem verdicts ([ECOSYSTEM.md](./ECOSYSTEM.md)): browser =
> playwright-mcp via `McpToolProvider`, agent = AI SDK provider.

Personas: **Operator** (runs tasks against configured cases), **Author** (creates
cases/skills), **Reviewer** (audits runs), **Integrator** (embeds Domia),
**Admin** (installs, secures, schedules).

---

## Part A — the mental model that makes journeys predictable

One sentence per noun the user must hold:

- **Case** = a target + how to reach/auth it + what it may touch. Reusable.
- **Run** = one request executed against one case by the loop. Disposable, traced.
- **Request** = plain-language intent. Never steps. The only task input.
- **Plan** = the agent's own to-do list, live, revisable — visible, not authored.
- **Persona** = a prompt+model+toolset preset the loop/agent runs as.
- **Artifact** = any blob a run produced (screenshot, video, file, report).
- **Skill / MCP mount** = extra capabilities a case can offer the agent.

If the user understands those seven, every screen and command below is guessable.
That predictability **is** the design goal — MIL uniformity applied to UX.

---

## Part B — the journeys

### J1 · Author creates a case (web, authenticated)

**Trigger.** "I want Domia to work inside our billing portal."
**Sees.** Case editor: name, target kind (web), URL, optional MCP mounts, tool
policy toggles, "Capture login" button, Validate.
**Chain.** `api.cases.create` → `CaseService.create` (Zod draft) →
`store.cases.insert`. "Capture login" → `cases.captureAuth` →
`tools.allocSession({headed, interactive})` → playwright-mcp launches headed →
Operator logs in by hand → session `storageState` exported → `SecretVault`
encrypts → `assets.authState`. `cases.validate` → reachability + auth-freshness +
secret-resolvability → advisory `Outcome`.
**Data.** `cases` row; encrypted auth blob on disk; validation is read-only.
**Why it works.** Auth is *data captured once*, not scripted steps that rot
(DESIGN §10.4). Playwright-mcp's `--storage-state` consumes it directly. Secrets
resolve into memory at run time and never enter traces.
**Breaks & recovery.** Login flow changes → next validate flags stale auth →
re-capture (one click), not a code edit. Target unreachable → validation says so
before any run is spent.

### J2 · Operator runs a quick task (CLI, unattended)

**Trigger.** `domia run "download this month's invoices as CSV" --case billing
--no-questions --approvals dangerous --watch`
**Sees.** Activity lane in terminal: turns, tool calls, plan ticks, cost; exit
code at end.
**Chain.** `api.runs.start` → `RunRegistry` allocs `case.allocContext` →
`tools.allocSession` (playwright-mcp + capture attach; storage-state loaded) →
`plan.allocContext` → `loop.engine.alloc` → `run.start()` background; CLI drains
`runs.watch`. THE loop: `session.observe` (ARIA snapshot) → `agent.step` (AI SDK,
propose-only) → `router` → `session.invoke` → capture after → informants → repeat
→ `final`.
**Data.** `runs`, append-only `exchanges`, `trace_spans/events`, `artifacts`;
`plans`+items iff the agent planned. Exit: 0 ok / 1 failed / 2 cancelled.
**Why it works.** `--no-questions` removes `user.ask` from the belt and the lead
persona prompt says "state assumptions in the plan instead" — so unattended never
blocks on a question. `--approvals dangerous` gates only risk-tagged tools (the
computer-use safety lesson) without limiting exploration.
**Breaks & recovery.** A click fails (stale ref) → playwright-mcp returns a
descriptive error + the next `observe` gives a fresh snapshot → the agent's
recovery discipline tries a different element (never blind-retry; §4.8). Site
slow → informant signals duration; agent waits or adapts; no engine timeout kills
it.

### J3 · Operator runs a bigger task and watches (UI) — the flagship

**Trigger.** New Run: pick case, type "reconcile March payouts against the
ledger and flag mismatches", Start.
**Sees.** Live run view: **activity lane** (agent thoughts + tool calls with
before/after screenshots streamed by artifact ref), **plan board** (fills and
ticks live), **question/approval/takeover cards** inline, **cost meter**,
**signal chips**.
**Chain.** `runs.start` → same alloc as J2. What happens next is the agent's,
all visible: it may `user.ask` "CSV or the reconciliation UI?" (run
`waiting_user` → card → `runs.answer` → reply returns as the tool result); it
`plan.propose`s (board fills via `run.plan.changed`); it acts, re-plans,
`memory.recall`s prior facts about this case, and — stakes being high — may
`agent.spawn` a `verifier` persona, `agent.await` its summary, then `final`.
**Data.** J2 + `plans`/`plan_items`/`plan_revisions` audit + `memories` touched +
`report_json`.
**Why it works.** Everything the UI shows is the *same trace* replay tests
consume — no UI-only state to drift (DESIGN §12). Watching mid-run is safe because
`runs.watch` emits a sync snapshot first, then live (F5). The agent asking *during*
execution (not just at t=0) is why there are no stages — ambiguity surfaces when
discovered.
**Breaks & recovery.** User closes the tab → run keeps going (it lives in
RunRegistry, not the tab); reopening replays the snapshot. Agent stuck waiting on
a human who left → idle informant auto-suspends (F6), resumable later.

### J4 · Operator steers a live run

**Trigger.** Pause / Cancel buttons; answering a card; approving a dangerous tool.
**Chain.** `api.runs.pause|cancel|answer` → `RunRegistry` → live `LoopRun`
method → `Gate` (checked between turns AND between calls). Cancel = only hard stop.
**Why it works.** Gates are cooperative and frequent, so control feels immediate
without `kill` corrupting a half-written action. Authority is the user's; the
agent is never *limited*, only *interrupted or informed*.
**Breaks & recovery.** Process died since start → `RunRegistry` miss →
`RUN_NOT_LIVE` with a `domia run resume <id>` hint; store rows are the source of
truth for the dead run.

### J5 · A task pauses for a human, then resumes days later

**Trigger.** Agent hits a CAPTCHA / 2FA / payment confirm.
**Chain.** Agent calls `user.takeover` (R2) → `TakeoverHandler` flips the session
headed and surfaces a "take control" card → human completes the step → confirm →
agent resumes with a fresh observation. If no human now: agent calls `suspend`
(or F6 idle) → `agent.snapshot()` → `snapshots` row+blob → `session.dispose()`.
Later `domia run resume <id>` → `case.allocContext` → new `TargetSession` →
`agent.restore` → loop continues mid-run.
**Why it works.** Takeover generalizes auth-capture to *anytime* (Operator's
login/payment lesson). Suspend/resume is honest because plan + exchanges were rows
all along — nothing to reconstruct, just rehydrate the conversation.
**Breaks & recovery.** Auth expired during suspension → resume's first observe +
a validate signal tells the agent; it may re-drive login (skill) or ask for
re-capture.

### J6 · Agent uses external tools via MCP

**Trigger.** Case `billing` mounts `github` + `postgres` MCP servers; request:
"file a GitHub issue for every ledger mismatch you find".
**Chain.** `tools.allocSession` → `McpServerManager` spawns the mounts
(kernel-tracked), `McpToolProvider` lists their tools → mapped to `ToolManifest`s
under `risk: 'guarded'` → offered per tool policy. The agent interleaves
`browser.*` (reconcile in the portal) and `github.create_issue` (MCP) — one belt,
one router, one trace.
**Why it works.** 5,800 ecosystem servers become capability with zero Domia code
(E1). MCP tools ride the same invoke middleware, so they're traced, policy-gated,
and approval-gated identically to built-ins — no privileged path.
**Breaks & recovery.** MCP server crashes → its calls return failed `Outcome`s
with the server error → agent adapts (retries via UI, or notes the limitation);
`McpServerManager` restart policy re-spawns; other tools unaffected.

### J7 · Author teaches a reusable skill

**Trigger.** "Our export flow is fiddly; capture it once."
**Chain.** During/after a clean run, `skill.save {name, fromCallRange}` →
`SkillRecorder` writes `prompts/skills/export-invoices/SKILL.md` (Agent Skills
spec, E4) + `recording.json`. Next runs: `SkillLibrary` offers `skill.export-
invoices` only when the request matches its description (progressive disclosure).
**Why it works.** Spec-compliant skills are portable to Claude Code / Codex CLI
and back (E4). Selective offering keeps the toolset small (OpenClaw lesson) so
the model stays sharp. The skill is guidance + optional deterministic replay —
never a hardcoded step the user must maintain.
**Breaks & recovery.** Skill's recording drifts from the UI → replay step fails
with a descriptive error → agent falls back to doing it live from the SKILL.md
instructions → offer to re-record.

### J8 · Reviewer audits a run

**Trigger.** "Why did run X charge that refund?"
**Chain.** UI trace tab: `traces.timeline` (spans + turns + tool calls),
filmstrip (artifacts via `domia-artifact://` protocol, F4), plan history,
`memories` used, cost rollup, every informant signal. CLI: `domia trace show
<id> --tree`. Full replay: `agent=ReplayProvider(runId)` + real playwright-mcp on
a fixture → deterministic re-execution.
**Why it works.** The trace is complete by construction (every alloc/exchange/
call/plan-revision/spawn is traced, R3 of DESIGN §5.3) and secret-redacted, so
audit needs no extra instrumentation. Replay at the agent boundary re-exercises
loop+tools+trace for real (§8.4).
**Breaks & recovery.** N/A — read-only. Missing artifact (disk pruned) → ref
shows "expired", timeline still intact.

### J9 · Admin schedules recurring runs

**Trigger.** "Reconcile every weekday 6am."
**Chain.** `api.schedules.create {cron, caseId, request, options}` → `schedules`
row → host `Scheduler` ticker fires → `runs.start` (headless, `--no-questions`) →
normal run → result event. Heartbeat = a schedule with a standing "check X" request.
**Why it works.** Scheduling is a thin wrapper over the same `runs.start` — no
special execution path (OpenClaw cron lesson, R5). Failures surface as normal
failed runs in history + optional notify sink.
**Breaks & recovery.** A scheduled run needs a human (`user.ask` with no TTY) →
auto-suspends → notify → Admin resumes or the next tick supersedes.

### J10 · Integrator embeds Domia

**Trigger.** Another team's agent (Claude Code) wants Domia as a tool.
**Chain.** Run `domia-mcp` (E6) → exposes `domia_run_start/status`,
`domia_case_list`, `domia_trace_timeline` over the api facade → the external host
mounts it like any MCP server.
**Why it works.** Domia is symmetric: it *consumes* MCP (J6) and *is* an MCP
server. The api facade already is the whole surface, so the server is a thin
projection — no new logic.
**Breaks & recovery.** Long run over MCP → `domia_run_start` returns a runId
immediately; the host polls `domia_run_status` or subscribes — never blocks.

### J11 · Admin installs / goes local / secures

**Trigger.** First install; offline requirement.
**Chain.** `domia doctor` → `bootHeadless(minimal)` checks: playwright-mcp
reachable, model providers resolvable, db writable, prompts dir found. Go local:
settings → persona `lead` → provider `ollama`, model `qwen…`; `agents.models`
lists the local daemon. Secure: cases loopback-only, tool policy denies `shell`,
approvals `dangerous`, MCP mounts reviewed.
**Why it works.** AI SDK's provider neutrality (E3) makes local a config flip, not
a port. Structured (ARIA/a11y) observation keeps small local models viable
(Fazm/browser-use lesson). Loopback + tool policy + approvals compose the
security posture without limiting a trusted agent.
**Breaks & recovery.** Local model weak at tool-calling → failover chain (R7)
falls back to a stronger provider on malformed-tool errors (not on task
difficulty).

---

## Part C — cross-cutting guarantees (why the *set* works)

| Guarantee | Mechanism | Journeys relying on it |
|---|---|---|
| Nothing blocks unattended | `user.ask` removable; idle auto-suspend (F6); MCP long-ops return handles | J2, J9, J10 |
| Control is immediate & safe | frequent cooperative gates; cancel-only hard stop | J3, J4 |
| Everything is auditable & replayable | one complete redacted trace; replay at agent boundary | J3, J8 |
| Capability grows without code | MCP mounts + skills, both governed by tool policy + approvals | J6, J7, J11 |
| Freedom is preserved | no stages/steps; informants not vetoes; recovery is the agent's | all |
| Live state can't leak | kernel tracks contexts (browsers, MCP servers, conversations); force-dispose at shutdown | J2, J5, J6 |
| Same surface everywhere | one `DomiaApi` for UI, CLI, MCP-out; sync-snapshot-then-stream | J3, J10 |

If a future feature can't be expressed as a journey above without adding a stage,
a step engine, a veto, or a second execution path — it's the wrong feature.

---

## Part D — journey → design feedback (new this iteration)

| # | Surfaced by | Patch |
|---|---|---|
| F7 | J5 | `user.takeover` needs the session to flip headed **mid-run**; `TargetSession.setHeaded(bool)` added (playwright-mcp: relaunch context with headed + reuse storage-state) |
| F8 | J6 | MCP server lifecycle = kernel-tracked context with a **restart policy**; one crashed mount must not fail the run — isolate to failed `Outcome`s |
| F9 | J7 | Skills must be spec-portable → adopt SKILL.md verbatim (E4); Domia's replay is an optional asset, not a spec fork |
| F10 | J9, J10 | Any entry that may run unattended must degrade a would-be `user.ask` to a suspend+notify, never a hang — enforced in `AskHandler` when no interactive surface is attached |
| F11 | J6, J11 | Tool policy must gate **MCP-mounted** tools too, not just built-ins → policy evaluated at `session.manifests()` over the merged catalog |
