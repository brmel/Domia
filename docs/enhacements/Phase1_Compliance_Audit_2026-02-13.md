# Phase 1 Compliance Audit (2026-02-13)

## Scope
This audit checks implementation alignment for:
- Phase 1 Durable Orchestration Foundations
- Phase 1.1 Budget Policy Scaffold
- Phase 1.3 Recovery Policy Scaffold
- UI architecture expectations for early phases (UI-1/UI-2)

## Overall Status
- Runtime Phase 1 foundations: Aligned
- Recovery real behavior sprint: Implemented (manual-only replay + guard + telemetry)
- UI architecture: Good foundation, partially complete for UI-2
- Primary risk: timeline and skills/plugins usage tabs are not yet first-class in Run Workspace

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

### 8) Replanning contract (observe-only scaffold)
Status: Aligned
Evidence:
- [src/application/services/execution/ReplanningPolicyService.ts](src/application/services/execution/ReplanningPolicyService.ts)
- [src/application/use-cases/RunTestUseCase.ts](src/application/use-cases/RunTestUseCase.ts)
- [src/application/services/execution/ReplanningPolicyService.test.ts](src/application/services/execution/ReplanningPolicyService.test.ts)

### 9) Replay idempotency dedupe ledger
Status: Aligned
Evidence:
- [src/application/services/execution/RecoveryReplayIdempotencyService.ts](src/application/services/execution/RecoveryReplayIdempotencyService.ts)
- [src/domain/ports/IPersistenceAdapter.ts](src/domain/ports/IPersistenceAdapter.ts)
- [src/infrastructure/adapters/persistence/SQLiteAdapter.ts](src/infrastructure/adapters/persistence/SQLiteAdapter.ts)
- [src/application/use-cases/RunTestUseCase.ts](src/application/use-cases/RunTestUseCase.ts)

## Known Gaps (Phase 1+)

### A) Run Workspace timeline tab and usage tabs
Priority: Medium
Current:
- Run Workspace includes Plan/State/Checkpoints and Safety, but not first-class Timeline or Skills used / Plugins used tabs.

### B) Compose advanced options extraction depth
Priority: Medium
Current:
- Compose is now separated as its own workspace shell, but advanced controls remain in incremental rollout mode.

## UI Architecture Alignment

### Delivered (UI-1 / partial UI-2)
- Top-level section shell exists with Runs, Compose, Skills, Plugins, Governance, Observability tabs:
  - [src/App.tsx](src/App.tsx)
- Runs workspace implemented with:
  - live area + activity stream
  - plan/state/checkpoints tabs
  - safety panel (readiness + policy view)
  - [src/presentation/components/TestRunner.tsx](src/presentation/components/TestRunner.tsx)
- Dedicated Compose workspace extracted:
  - [src/presentation/components/ComposeWorkspace.tsx](src/presentation/components/ComposeWorkspace.tsx)
- Runs workspace extracted:
  - [src/presentation/components/RunsWorkspace.tsx](src/presentation/components/RunsWorkspace.tsx)

### Pending for clear component boundaries
1. Introduce explicit view-model layer for run event stream rows and policy badges.
2. Add Timeline tab as first-class component in Run Workspace.
3. Add Skills used / Plugins used tabs in Run Workspace.

## Recommended Next Steps
1. Add Run Workspace timeline tab and map replay/replanning telemetry into it.
2. Add Skills used / Plugins used tabs and event mapping contracts.
3. Add a Run Workspace component contract doc for clear UI component ownership.

## Validation Snapshot
Last verification run:
- typecheck: pass
- tests: pass (16 files, 56 tests)
