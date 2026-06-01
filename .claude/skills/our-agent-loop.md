---
name: our-agent-loop
description: End-to-end agent run pipeline. RunUseCase orchestrator, the decomposed services it delegates to, the StepExecutionKernel, the IAgentRuntime port, and how AgentOutcome shapes the final RunOutput.
---

# The Agent Loop — End-to-End

A run is one user goal driven against one platform target. This is the canonical flow.

## Top-level pipeline

```
User input (prompt + platform)
    ↓
apps/desktop/ipc/routers/runRouter  OR  apps/cli/RunCommand
    ↓
RunUseCase.execute(input, controller, runContext?)
    ↓
yields RunOutput events (started, acting, state_updated, completed, cancelled, error)
    ↓
UI store reducer  /  CLI switch
```

`RunUseCase.execute` is an `AsyncGenerator<RunOutput, void>`. Both UI and CLI consume the same stream.

## Inside RunUseCase — a sequence of narrow services

```
RunUseCase  (orchestrator: injects RunStepEngine + policy/lifecycle/plan services)
├── RuntimeReadinessPolicyService.assess()       → may yield ReadinessError
├── engine.acquireLane()                         → lane lock per platform target
├── RunLifecycleManager.initializeRun()          → persist Run, emit run.started
├── engine.prepareSession()                      → IAppDriver + IStructuredAutomation
├── (loop body)
│   ├── engine.checkpoint(...)                   → CheckpointReason
│   ├── RunPlanCoordinator.buildSinglePromptPlan()
│   ├── RunControlGateService.evaluate()         → pause/cancel gate
│   ├── RunPlanCoordinator.activate()
│   ├── engine.executeStep()                     → StepExecutionKernel → IAgentRuntime
│   └── RunPlanCoordinator.applyOutcome()
└── engine.concludeRun()                         → terminalize-or-suspend + RunOutput
```

`RunStepEngine` (`backend/runs/engine/`) bundles the run-step machinery — kernel,
durability, session, terminalization, suspension, lane — so both `RunUseCase`
(fresh run) and `RunResumeService` (resume) inject one engine instead of
re-wiring six services. Each service has one responsibility; to add a pipeline
step, add a service (surface it on the engine if shared) — don't grow the
orchestrator (CLAUDE.md trap #3).

## StepExecutionKernelService

Drives `IAgentRuntime.run(input, automation)` and translates its `AgentEvent` stream into `RunOutput` events:
- `agent action` → save `Step` row → `WorkflowState.applyAction` → checkpoint with `CheckpointReason.ActionApplied` → yield `state_updated`.
- `thinking_chunk` → yield `thinking_chunk`.
- Mid-stream pause/cancel checks at every action.
- Throws `BudgetExceededError` when budget is exceeded; the orchestrator catches and routes to terminalization.

## IAgentRuntime — the agent-provider boundary

```ts
interface IAgentRuntime {
    run(input: AgentInput, automation: IStructuredAutomation):
        AsyncGenerator<AgentEvent, AgentOutcome>;
}
```

Today the only impl is `AdkAgentRuntime` in `infrastructure/agent-runtime/adk/`. To add OpenAI/Anthropic/local: implement `IAgentRuntime` in a new folder under `infrastructure/agent-runtime/<provider>/`, register under the `'IAgentRuntime'` token in the container.

## AgentOutcome — three kinds

```ts
type AgentOutcome =
    | { kind: 'done'; output: { summary; verdict?: 'pass' | 'fail'; value? } }
    | { kind: 'stopped'; reason: 'cancelled' | 'budget_exhausted' | 'no_progress'; summary }
    | { kind: 'error'; cause: Error };
```

Critical rule: `verdict` is **optional**. The agent finishing without a verdict is normal and legitimate (e.g. data extraction, exploration tasks). `RunLifecycleManager.finalizeRun` routes:
- `done` + `verdict: 'pass'` → `Run.pass`
- `done` + `verdict: 'fail'` → `Run.fail`
- `done` + no verdict → `Run.finish` (with optional `value`)
- `stopped` or `error` → `Run.fail`

Never assume the agent must produce a pass/fail.

## The terminal tool

The agent uses one terminal tool: `finish({ summary, verdict?, value? })`. Defined in `infrastructure/tools/catalog/terminal.tools.ts`. There is no separate `pass` or `fail` tool.

## AgentEvent shape

```ts
type AgentEvent =
    | { type: 'thinking_chunk'; text }
    | { type: 'action'; action: AgentAction; actionIndex: number; trace: Partial<StepTrace> };
```

Tools are typed `ToolSpec`s defined in `infrastructure/tools/catalog/`. Adding a new tool:
1. Add a new `ActionType` value if needed.
2. Create a `ToolSpec` in the appropriate `*.tools.ts`.
3. Wire dependencies through `ToolDependencies`.
4. Test with `tests/e2e/tools/`.

## Observability

`EventBus` (mitt-backed) emits domain events. `EventLogger` subscribes and routes to `pino`. Business code never logs directly; it emits domain events.

## Where NOT to add code

- `RunUseCase`: no new logic. Add a service, wire it in.
- Domain ports: no implementation, only interfaces.
- `AdkAgentRuntime`: only ADK-specific concerns. Generic agent loop logic goes in `infrastructure/agent/common/`.
