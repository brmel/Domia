---
name: our-agent-loop
description: End-to-end agent run pipeline — RunUseCase orchestrator, the narrow services it delegates to, StepExecutionKernel, the IAgentRuntime port, and how AgentOutcome shapes the final RunOutput.
---

# The Agent Loop — End-to-End

A run is one user goal driven against one platform target. `RunUseCase.execute` is an `AsyncGenerator<RunOutput, void>` consumed identically by the desktop IPC (`runRouter`) and the CLI (`RunCommand`).

## Pipeline (inside RunUseCase)

```
RuntimeReadinessPolicyService.assess()    → advisory readiness report
engine.acquireLane()                       → lane lock per platform target
RunLifecycleManager.initializeRun()        → persist Run, emit run.started
engine.prepareSession()                    → IAppDriver + IStructuredAutomation
RunPlanningService.plan()    (gated DOMIA_PLANNER) → optional goal decomposition
RunPlanCoordinator.build/activate()
RunControlGateService.evaluate()           → pause/cancel gate
engine.executeStep()                       → StepExecutionKernel → IAgentRuntime
RunPlanCoordinator.applyOutcome()
RunEvaluationService.evaluate() (gated DOMIA_EVALUATOR) → reflection on a done outcome
engine.concludeRun()                       → terminalize-or-suspend + final RunOutput
```

`RunStepEngine` (`backend/runs/engine/`) bundles the run-step machinery (kernel, durability, session, terminalization, suspension, lane) so both `RunUseCase` and `RunResumeService` inject one engine. To add a step, add a service — don't grow `RunUseCase` (CLAUDE.md trap #3).

## StepExecutionKernelService

Drives `IAgentRuntime.run(input, automation)` and maps its `AgentEvent` stream to `RunOutput`:
- `action` → save `Step` → `WorkflowState.applyAction` → checkpoint (`CheckpointReason.ActionApplied`) → yield `state_updated`.
- `thinking_chunk` → yield through.
- Pause/cancel/suspend checks at every action.

Budget ceilings (max actions/duration/tokens) are enforced **inside the runtime**: exhaustion surfaces as `AgentOutcome { kind: 'stopped', reason: 'budget_exhausted' }`, which the kernel routes to terminalization (no exception).

## IAgentRuntime — the agent-provider boundary

```ts
interface IAgentRuntime {
    run(input: AgentInput, automation: IStructuredAutomation): AsyncGenerator<AgentEvent, AgentOutcome>;
}
```
Only impl: `AdkAgentRuntime` (`infrastructure/agent-runtime/adk/`). New provider → implement the port in `infrastructure/agent-runtime/<provider>/`, register under `'IAgentRuntime'`. ADK-specific concerns stay in that folder; generic loop helpers go in `infrastructure/agent/common/`.

## AgentOutcome routing (verdict is OPTIONAL)

```ts
type AgentOutcome =
    | { kind: 'done'; output: { summary; verdict?: 'pass' | 'fail'; value? } }
    | { kind: 'stopped'; reason: 'cancelled' | 'budget_exhausted' | 'no_progress'; summary }
    | { kind: 'error'; cause: Error };
```
`RunLifecycleManager` routes: `done`+`pass`→`Run.pass`, `done`+`fail`→`Run.fail`, **`done`+no verdict→`Run.finish`** (with optional `value`), `stopped`/`error`→`Run.fail`. A verdict-less finish is normal (extraction/exploration) — never assume pass/fail is required.

The single terminal tool is `finish({ summary, verdict?, value? })` (`infrastructure/tools/catalog/terminal.tools.ts`); there is no separate pass/fail tool.

## Observability

`EventBus` (mitt) emits `DomainEvents`; two sinks subscribe — `EventLogger` → pino and `RunTraceWriter` → per-run `trace.jsonl`. `TraceService` emits the run→tool OTLP span tree (when `DOMIA_OTEL_ENDPOINT` is set). Business code emits events, never logs directly.
