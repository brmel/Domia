# ADR: Phase 1.3 Recovery Policy Scaffold

## Status
Accepted (Scaffold)

## Decision
Introduce recovery policy decision model with modes:
- `observe`
- `manual-only`
- `auto-safe`

Current runtime defaults to observe-only behavior.

## Added
- `RunRecoveryPolicyService`

## Controls
- No automatic recovery execution in this phase.
- Decisions are explicit and typed for future rollout.
