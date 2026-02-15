# ADR: Phase 1.3 Recovery Policy Scaffold

## Status
Accepted (Scaffold)

## Decision
Introduce recovery policy decision model with modes:
- `observe`
- `manual-only`
- `auto-safe`

Current runtime defaults to observe-only behavior.

Manual recovery replay is now implemented for `manual-only` under explicit feature-flag and input controls.

## Added
- `RunRecoveryPolicyService`
- `ManualRecoveryBootstrapService`
- `RecoveryReplayGuardService`
- `RunTestUseCase` replay telemetry (`recovery_replay` events)

## Controls
- No automatic recovery execution (`auto-safe`) in this phase.
- Decisions are explicit and typed for future rollout.
- Manual replay blocks non-idempotent action classes.
