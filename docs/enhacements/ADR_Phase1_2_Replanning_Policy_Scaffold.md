# ADR: Phase 1.2 Replanning Policy Scaffold

## Status
Accepted (Design + observe-only scaffold)

## Date
2026-02-13

## Context
Phase 1 defines a replanning contract with trigger conditions and bounded counts, but runtime must remain deterministic and avoid hidden behavior changes.

## Decision
Introduce a typed `ReplanningPolicyService` in observe-only mode.

The service:
1. Defines replanning triggers (`loop_detected`, `action_execution_error`, `assertion_fail`, `max_actions_reached`).
2. Applies a bounded per-run replanning budget contract.
3. Emits non-blocking suggestions through logs.

## Scope
Included:
- replanning contract types and defaults
- observe-only assessment API
- non-invasive hook in `RunTestUseCase` failure boundaries

Not included:
- automatic replanning execution
- planner retries or branch plan merge
- soft/hard enforce modes

## Controls
- `shouldReplan` remains false in this phase.
- Suggestions are logged only; run terminal behavior is unchanged.
- No backward compatibility shims or legacy branches are introduced.

## Next Step
In a later phase, add controlled execution modes:
- `observe` (current)
- `manual-only` (operator-confirmed replanning)
- `auto-safe` (bounded automatic replanning with strict safety gates)
