# ADR: Phase 1 Durable Orchestration Foundations

## Status
Accepted (Design + scaffolding)

## Date
2026-02-13

## Context
Domia must support longer and more complex runs while remaining deterministic and recoverable.
We need to prepare architecture for durable execution without introducing heavy behavior changes yet.

Current strengths already in place:
- run lane serialization
- typed step terminal outcomes
- shared retry policies
- checkpoint persistence primitives

Gap to close in Phase 1:
- explicit lifecycle state machine for run orchestration
- standard checkpoint reasons and lifecycle transitions
- no-fail durability hooks in the run use-case

## Decision
We introduce a Phase 1 durability scaffold with three components:

1. **Run lifecycle contract**
   - Add typed run lifecycle states and allowed transitions.
   - Validate transitions centrally before state updates.

2. **Durability service**
   - Add a dedicated service to record checkpoints and lifecycle transitions.
   - Service must never fail the run due to checkpoint persistence errors.

3. **Use-case lifecycle hooks**
   - Add non-invasive calls in run orchestration for:
     - initialization checkpoint
     - planning start + plan-ready checkpoint
     - action-applied checkpoints
     - pause/resume checkpoints
     - terminal checkpoints (success/failure/cancel)

This is a **preparation phase** and intentionally avoids advanced recovery/replay execution logic.

## Scope (Phase 1)
Included:
- contracts and transition rules
- checkpoint reason taxonomy
- no-op-safe service wiring and invocation points
- unit tests for lifecycle transition validation

Not included:
- automatic replay engine
- automatic resume from historical checkpoint
- milestone graph planning
- enterprise policy escalations and HITL prompts

## Architecture Notes

### Lifecycle States
- initialized
- planning
- executing
- paused
- completed
- failed
- cancelled

### Transition Rules
- initialized -> planning | failed | cancelled
- planning -> executing | failed | cancelled
- executing -> paused | completed | failed | cancelled
- paused -> executing | failed | cancelled
- completed/failed/cancelled are terminal

### Checkpoint Reasons
- run_initialized
- plan_ready
- action_applied
- pause_requested
- resume_requested
- terminal_success
- terminal_failure
- terminal_cancelled

## Safety and Reliability Controls
- Invalid transition attempts are ignored and logged.
- Checkpoint persistence failures are logged, never raised to abort run.
- Existing terminal behavior remains unchanged.
- Existing retries/lane serialization remain untouched.

## Consequences
Positive:
- Establishes durable orchestration contracts early.
- Creates clean insertion points for future replay/resume features.
- Improves auditability with consistent checkpoint reasons.

Trade-offs:
- Slight increase in checkpoint writes.
- Added lifecycle log noise (manageable with log level filtering).

## Validation Strategy
- Unit tests for lifecycle transition rules.
- Full regression run (`test:all`) to ensure no functional regression.
- Verify terminal behavior remains deterministic.

## Next Steps (Phase 1.1 / Phase 2 Preparation)
1. Add milestone-level checkpoint strategy (configurable frequency).
2. Add checkpoint compaction policy.
3. Add replay read model contract (without execution yet).
4. Introduce budget policy interfaces (duration/actions/tokens).
