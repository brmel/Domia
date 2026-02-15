# Phase 3 Architecture Contract

This contract is mandatory for all workflow features.

## Layering Rules

- `domain/*` is pure and has no infrastructure imports.
- `application/*` orchestrates use-cases/services and depends only on domain ports.
- `infrastructure/*` implements ports and contains all external IO.
- `presentation/*` consumes tRPC APIs and never calls persistence directly.

## Workflow Rules

- Published workflow definitions are immutable.
- Draft workflow definitions are the only editable definitions.
- New versions are created as new draft definitions.
- Runtime execution always uses one definition version snapshot.

## Runtime Rules

- One active workflow controller at a time.
- Start/cancel are idempotent and race-safe.
- Policy checks run before each step execution.
- Step retries/timeouts are policy-driven, not inline ad-hoc logic.

## Cleanup Rules

- No legacy bypass branches in runtime paths.
- No duplicate DTO/domain structures for the same concept.
- Every new public behavior requires high-level tests.
