# Implementation Kickoff Runbook (Post-Scaffold)

## Goal
Move from scaffold-only behavior to real implementation in controlled stages, without destabilizing default runtime behavior.

## Safety Rules
- Keep all advanced behavior behind explicit feature flags.
- Default mode remains scaffold/observe.
- Enable one capability family at a time.
- Validate with targeted tests first, then full `npm run test:all`.

## Feature Flag Matrix

### Recovery
- Flag: `DOMIA_ENABLE_RECOVERY_SCAFFOLD`
- Input options: `recoveryRunId`, `recoveryMode`
- Current behavior: decision/logging preflight only
- Real work next: add manual-only replay executor using compacted checkpoints

### Temporal Observation
- Flag: `DOMIA_ENABLE_TEMPORAL_OBSERVATION`
- Input options: `temporalObservation`, `temporalBurstFrames`
- Current behavior: bounded timeline capture + prompt context wiring
- Real work next: adaptive trigger policies and snapshot/storage budget enforcement

### Skills
- Flag: `DOMIA_ENABLE_SKILL_SCAFFOLD`
- Input options: `preferredSkillId`, `allowedSkillTrustLevels`
- Current behavior: registry/governance preflight only
- Real work next: planner-to-skill routing and skill execution graph

### Plugins
- Flag: `DOMIA_ENABLE_PLUGIN_SCAFFOLD`
- Input options: `pluginPreflight`
- Current behavior: policy-gated preflight invocation
- Real work next: execution adapters with strict capability boundaries and approvals

### Readiness
- Flag: `DOMIA_ENABLE_READINESS_GATES`
- Modes: `DOMIA_READINESS_MODE=observe|soft-enforce` or input option `readinessMode`
- Current behavior: readiness report, optional soft block
- Real work next: CI release gate integration + environment baseline profiles

## Recommended Rollout Order
1. Recovery (manual-only replay path)
2. Temporal (adaptive burst + storage controls)
3. Skills (single verified skill path)
4. Plugins (read-only first)
5. Readiness soft-enforce in staging, then prod

## Environment Profiles

### Dev (fast iteration)
- Enable one target capability flag only.
- Keep readiness disabled or `observe`.

### Staging (integration confidence)
- Enable readiness: `DOMIA_ENABLE_READINESS_GATES=true`
- Use `DOMIA_READINESS_MODE=observe` first, then `soft-enforce`.
- Run full regression before merge.

### Production (controlled adoption)
- Roll out by capability cohort and monitor logs.
- Enable soft-enforce only after 1-2 stable staging cycles.

## First Real Work Sprint (Suggested)
1. Implement manual-only recovery replay (no auto-safe).
2. Add idempotency guards for replayable action classes.
3. Add integration tests for replay success/failure/cancel boundaries.
4. Publish run-level telemetry for replay and checkpoint compaction.

## Pre-Commit Checklist
- `npm run typecheck`
- Targeted tests for touched service(s)
- `npm run test:all`
- Verify advanced behavior still off by default when flags are unset
