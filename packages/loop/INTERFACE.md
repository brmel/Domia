# @domia/loop — Interface Spec

**Purpose.** The agentic harness. ONE loop (observe → step → act), a meta-tool
belt, and the deterministic ring: router, gates, informants, trace, persistence.
No stages, no phases, no plans in code — behavior lives in persona prompts.
The only module that touches agent AND tools AND plan AND memory.

**Kind.** K2 factory (`LoopRun`) + K3 meta-tools (`MetaToolHandler`).

Incorporates D5 (stamps callId), D6 (observation from tool output), D7
(`ToolsetComposer`), D9 (sequential calls), D12 (unattended `ask` degrades).

---

## Public interfaces (contracts `loop.ts`)

```ts
export interface LoopEngine {                              // EP.LoopEngine (one)
  registerMetaTool(h: MetaToolHandler): void;              // sync, init-time
  personas(): readonly Persona[];                          // sync
  alloc(binding: RunBinding): Promise<ModuleResult<LoopRun>>;
}
export interface RunBinding {
  readonly caseCtx: CaseContext; readonly request: string;
  readonly options?: RunOptions; readonly parentRunId?: RunId;
}
export interface RunOptions {
  readonly questions?: 'allowed' | 'never';                // 'never' removes user.ask
  readonly approvals?: 'off' | 'dangerous';                // gate risk-tagged tools
  readonly interactive?: boolean;                          // D12 — false ⇒ ask degrades to suspend+notify
  readonly persona?: PersonaId;                            // lead override
  readonly personaOverrides?: Readonly<Record<string, Partial<Persona>>>;
  readonly budgetHints?: BudgetInformant;                  // signals only
}
export interface Persona {
  readonly id: PersonaId; readonly prompt: PromptRef;
  readonly model?: ModelSpec; readonly toolset: ToolsetSelector;   // 'full'|'observe-only'|'no-target'|string[]
}

export interface LoopRun extends Context<RunConfig, RunState> {
  readonly runId: RunId;
  start(): Promise<ModuleResult<Outcome<RunReport>>>;      // resolves at terminal state
  pause(): Promise<ModuleResult<void>>;
  resume(): Promise<ModuleResult<void>>;
  cancel(reason: string): Promise<ModuleResult<void>>;     // only hard stop
  answer(reply: HumanReply): Promise<ModuleResult<void>>;  // resolves ask/approval/takeover
  events(signal?: AbortSignal): AsyncIterable<RunEvent>;
}

export interface MetaToolHandler {                         // EP.MetaTool (many)
  manifests(run: LoopRunView): readonly ToolManifest[];    // sync; capability/option-gated
  dispatch(call: ToolCall, run: LoopRunInternals): Promise<ModuleResult<Outcome<ToolOutput>>>;
}
```

## THE loop (`loop.ts`, ~150 lines)

```
seed        ← ToolsetComposer.compose(persona)            target ∪ plan.* ∪ memory.* ∪ meta, gated (D7)
agent       ← agents.alloc({persona, tools: seed, ...})
memoryCards ← memory.relevant(caseId, request)            selective injection (R3)
obs         ← session.observe()                           ONCE at start (D6)
turn        ← agent.step({goal: request, observation: obs, memory: memoryCards})
loop while turn.kind == 'act':
    await gate()                                          pause/cancel checkpoint (D-fine-grained)
    results ← []
    for pc in turn.calls:                                 sequential (D9)
        call   ← router.stamp(pc)                         mint callId/seq (D5)
        result ← router.route(call)                       → session | plan | memory | meta
        results.push({callId: call.callId, outcome: result})
        await gate()                                      between calls too
    obs      ← lastObservationFrom(results) ?? undefined  from ToolOutput.observation (D6); no extra observe
    signals  ← informants.collect()                       budget·duration·plan_stale·context_pressure·idle
    turn     ← agent.step({toolResults: results, observation: obs, signals})
if turn.kind == 'ask':   → AskHandler (D12) → answer → agent.step({user: reply}) → continue
if turn.kind == 'final': → RunReportAssembler → Outcome
```

## Router (`router.ts`) — prefix table (D5 stamps, D9 serializes)

| Prefix | Target |
|---|---|
| `browser.` `input.` `shell.` `fs.` `screen.` `os.` `vision.` + MCP tool names | `session.invoke` |
| `plan.` | `planCtx.dispatch` |
| `memory.` | `memoryService.dispatch` |
| `user.` `agent.` `context.` `skill.` `suspend` | registered `MetaToolHandler`s |
| unknown | `Err(UNKNOWN_TOOL)` — never a throw |

## Meta-tool belt (`meta/*.ts`)

| Tool | Handler | Effect |
|---|---|---|
| `user.ask {question}` | `AskHandler` | interactive → gate `waiting_user` → reply is the tool result; **non-interactive (D12) → suspend+notify** |
| `user.takeover {reason}` | `TakeoverHandler` | `session.setHeaded(true)` → human drives → confirm → resume with fresh obs (R2/F7) |
| `agent.spawn {persona, request, share?}` | `SpawnHandler` | child `LoopRun` (own session+conversation, `parentRunId`); returns childRunId |
| `agent.await {runIds}` | `AwaitHandler` | joins; only children's `final` summaries return (context isolation) |
| `context.handoff {summary, nextFocus}` | `HandoffHandler` | fresh conversation seeded w/ summary + plan + last obs; same run (iterate) |
| `skill.save/list` | `SkillsHandler` | mint SKILL.md + recording / list offered skills |
| `suspend {reason}` | `SuspendHandler` | `agent.snapshot` → store → `session.dispose` → status suspended |

## Internal classes

| Class | File | Responsibility |
|---|---|---|
| `LoopModule` / `LoopEngineImpl` | `module.ts` `engine.ts` | belt assembly, persona resolution, run alloc |
| `LoopRunImpl` | `run.ts` | lifecycle; lazy alloc of session/plan/memory-agent; drives `runLoop` |
| `runLoop` | `loop.ts` | the pseudocode above |
| `ToolRouter` | `router.ts` | stamp + prefix dispatch (D5/D9) |
| `ToolsetComposer` | `composer.ts` | **D7** — merge tool sources, gate by persona selector ∩ case policy (F11) |
| `Gate` | `gate.ts` | awaited between turns AND calls; pause/cancel/answer + approvals pass through |
| `InformantHub` (+`Budget`/`Duration`/`ContextPressure`/`Idle`) | `informants.ts` | one collection point; signals only; `Idle` drives F6 auto-suspend |
| `PersonaRegistry` | `personas.ts` | `prompts/personas/*.md` + settings overrides |
| `RunReportAssembler` | `report.ts` | final turn + plan snapshot + stats |
| meta handlers | `meta/*.ts` | ~40 lines each |

## Design notes / problems handled

- **D6** halves perception cost: observation comes from the last tool's output;
  standalone `observe` only at start / explicit look.
- **D7** — the loop, not the agent, knows tools exist. `ToolsetComposer` is the
  single merge+gate point (target ∪ plan ∪ memory ∪ meta, ∩ persona ∩ policy).
- **D12** — `AskHandler` reads `options.interactive`; unattended never hangs.
- **Fine-grained gates** make pause/cancel feel instant without `kill` corrupting a
  half-written action.
- **Personas are markdown** — tuning behavior (recovery style, when to ask/spawn)
  never recompiles TypeScript.

## File manifest

```
loop/
  package.json
  src/
    module.ts engine.ts startRun.ts run.ts drive.ts router.ts composer.ts
    control.ts journal.ts internals.ts assemble.ts deps.ts personas.ts
    meta/{handlers.ts, subruns.ts, meta.ts}
    index.ts
```

Note: the fine-grained gate lives in `control.ts` (RunControl); informants are
folded into `drive.ts` + `PlanContext.staleness` (D28); belt tools are
`meta/handlers.ts` (ask/suspend/handoff) + `meta/subruns.ts` (spawn/await, D27).
