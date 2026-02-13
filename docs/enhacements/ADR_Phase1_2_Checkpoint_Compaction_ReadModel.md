# ADR: Phase 1.2 Checkpoint Compaction + Recovery Read Model

## Status
Accepted (Scaffold)

## Decision
Add contracts and services for checkpoint compaction and recovery read models.
No automatic runtime replay is enabled yet.

## Added
- `CheckpointReadModel` contracts
- `CheckpointCompactionService`
- `RecoveryReadModelService`

## Controls
- Read-model generation is side-effect free.
- Existing runtime flow unchanged.
