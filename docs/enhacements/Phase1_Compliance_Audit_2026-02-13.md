# Phase 1 Compliance Audit (2026-02-13)

## Scope
This audit checks implementation alignment for:
- Phase 1 Durable Orchestration Foundations
- Phase 1.1 Budget Policy Scaffold
- Phase 1.3 Recovery Policy Scaffold
- UI architecture expectations for early phases (UI-1/UI-2)

## Overall Status
- Runtime Phase 1 foundations: Mostly aligned
- Recovery real behavior sprint: Implemented (manual-only replay + guard + telemetry)
- UI architecture: Good foundation, partially complete for UI-2
- Primary risk: Documentation now lags implementation in recovery behavior details

## Runtime Compliance Matrix

### 1) Lifecycle state machine and transitions
Status: Aligned
Evidence:
- [src/domain/value-objects/RunLifecycle.ts](src/domain/value-objects/RunLifecycle.ts)
- [src/application/services/execution/RunDurabilityService.ts](src/application/services/execution/RunDurabilityService.ts)
- [src/application/use-cases/RunTestUseCase.ts](src/application/use-cases/RunTestUseCase.ts)
Notes:
- Invalid transitions are ignored and logged.
- Terminal path remains deterministic (single terminal emission path in finally block).

### 2) Durable checkpoints and reason taxonomy
Status: Aligned
Evidence:
- [src/domain/value-objects/RunLifecycle.ts](src/domain/value-objects/RunLifecycle.ts)
- [src/application/use-cases/RunTestUseCase.ts](src/application/use-cases/RunTestUseCase.ts)
- [src/application/services/execution/CheckpointCompactionService.ts](src/application/services/execution/CheckpointCompactionService.ts)
Notes:
- Checkpoints are emitted at run init, plan ready, action applied, pause/resume, terminal states.

### 3) Durability must never fail run
Status: Aligned
Evidence:
- [src/application/services/execution/RunDurabilityService.ts](src/application/services/execution/RunDurabilityService.ts)
Notes:
- Persistence errors are logged and swallowed.

### 4) Budget contracts (observe/non-blocking)
Status: Aligned
Evidence:
- [src/application/services/execution/RunBudgetPolicyService.ts](src/application/services/execution/RunBudgetPolicyService.ts)
- [src/application/use-cases/RunTestUseCase.ts](src/application/use-cases/RunTestUseCase.ts)
Notes:
- Policy resolves limits and logs warning only.

### 5) Recovery policy modes and controls
Status: Aligned with post-scaffold progression
Evidence:
- [src/application/services/execution/RunRecoveryPolicyService.ts](src/application/services/execution/RunRecoveryPolicyService.ts)
- [src/application/services/execution/ManualRecoveryBootstrapService.ts](src/application/services/execution/ManualRecoveryBootstrapService.ts)
- [src/application/services/execution/RecoveryReplayGuardService.ts](src/application/services/execution/RecoveryReplayGuardService.ts)
- [src/application/use-cases/RunTestUseCase.ts](src/application/use-cases/RunTestUseCase.ts)
Notes:
- Manual-only replay behavior is implemented behind feature flag and recovery run id.
- Non-idempotent replay classes are blocked.

### 6) Replay telemetry publication
Status: Aligned (implemented)
Evidence:
- [src/application/dtos.ts](src/application/dtos.ts)
- [src/domain/events/TestRunEvent.ts](src/domain/events/TestRunEvent.ts)
- [src/presentation/stores/useTestRunStore.ts](src/presentation/stores/useTestRunStore.ts)
- [src/presentation/components/TestRunner.tsx](src/presentation/components/TestRunner.tsx)
Notes:
- Replay telemetry includes started/completed/cancelled/blocked/failed with replay counters and reason.

### 7) Recovery boundary tests
Status: Aligned
Evidence:
- [src/application/use-cases/RunTestUseCase.recovery.test.ts](src/application/use-cases/RunTestUseCase.recovery.test.ts)
- [src/application/services/execution/RecoveryReplayGuardService.test.ts](src/application/services/execution/RecoveryReplayGuardService.test.ts)

## Known Gaps (Phase 1+)

### A) Replanning contract not yet implemented
Priority: High
Expected by design docs:
- trigger conditions and bounded replanning count
Current:
- No explicit replanning policy/service wired in run loop.

### B) Idempotency key usage is local decision-only
Priority: Medium
Current:
- Guard computes idempotency keys per replayable action class.
- No persisted dedupe ledger keyed by idempotency key.
Impact:
- Safe class gating exists, but key-based dedupe semantics are not yet first-class.

### C) Documentation drift for recovery behavior
Priority: High
Current:
- Some ADR/runbook text still describes recovery as scaffold-only preflight.
- Runtime now includes manual-only replay + telemetry.
Required:
- Update docs to reflect current behavior and rollout controls.

## UI Architecture Alignment

### Delivered (UI-1 / partial UI-2)
- Top-level section shell exists with Runs, Compose, Skills, Plugins, Governance, Observability tabs:
  - [src/App.tsx](src/App.tsx)
- Runs workspace implemented with:
  - live area + activity stream
  - plan/state/checkpoints tabs
  - safety panel (readiness + policy view)
  - [src/presentation/components/TestRunner.tsx](src/presentation/components/TestRunner.tsx)
- Compose-adjacent controls currently embedded in Runs sidebar:
  - [src/presentation/components/TestForm.tsx](src/presentation/components/TestForm.tsx)

### Pending for clear component boundaries
1. Extract dedicated Compose page from TestForm-in-runs pattern.
2. Introduce explicit view-model layer for run event stream rows and policy badges.
3. Add Timeline tab as first-class component (currently absent in Run Workspace tabs).
4. Add Skills used / Plugins used tabs in Run Workspace.

## Recommended Next Steps
1. Update ADR/runbook text to mark manual-only replay as implemented under feature flag.
2. Add ReplanningPolicyService contract with observe-only mode and bounded counters.
3. Add persisted replay idempotency ledger (optional but recommended before auto-safe).
4. Refactor UI by extracting Compose into dedicated section and slimming Runs sidebar.
5. Add a Run Workspace component contract doc for clear UI component ownership.

## Validation Snapshot
Last verification run:
- typecheck: pass
- tests: pass (15 files, 52 tests)
