# ADR: Phase 1.1 Budget Policy Scaffold

## Status
Accepted (Design + non-blocking scaffold)

## Date
2026-02-13

## Context
Phase 1 introduced durable lifecycle/checkpoint scaffolding. Next we need budget policy foundations for:
- max action count
- max run duration
- estimated token budget
- retry budget

At this stage, we must avoid behavior regressions and avoid hard stopping runs.

## Decision
Introduce a budget policy service that:
1. Resolves budget limits from run options with safe defaults.
2. Assesses current run consumption against limits.
3. Logs non-blocking warnings when limits are exceeded.

No termination behavior is introduced in this phase.

## Scope
Included:
- budget contracts (`limits`, `snapshot`, `assessment`)
- default budget values
- non-blocking logging hook in execution loop

Not included:
- automatic cancellation on budget breach
- dynamic token accounting from provider telemetry
- policy escalation workflows

## Controls
- Any exceedance is observable via warning logs.
- Budget evaluation does not change terminal state decisions.
- Existing execution behavior remains deterministic and unchanged.

## Next Step
In a later phase, add policy mode options:
- `observe` (current)
- `soft-enforce` (graceful stop at boundary)
- `hard-enforce` (immediate stop)
