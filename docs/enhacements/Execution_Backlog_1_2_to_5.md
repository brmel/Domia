# Execution Backlog: Phase 1.2 → Phase 5 (Scaffold Progress)

## Completed Scaffold Milestones

- Phase 1.2: checkpoint compaction + recovery read model contracts
- Phase 1.3: recovery policy decision contracts
- Phase 2.1: temporal observation policy contracts
- Phase 2.2: timeline context assembly scaffold
- Phase 3: skills contracts + registry/governance scaffold
- Phase 4: plugin manifest/capability policy + gateway scaffold
- Phase 5: readiness gate evaluation scaffold

## Important

All items above are architecture scaffolding only.
No heavy runtime behavior was introduced in these milestones.

See `Implementation_Kickoff_Runbook.md` for rollout flags, environment profiles, and the recommended first real-work sprint.

## Next Implementation Track (when approved)

1. Enable checkpoint compaction persistence paths
2. Add controlled replay executor (manual-only mode first)
3. Add temporal capture in perception pipeline behind feature flag
4. Wire skills into planner with allowlist
5. Wire plugin gateway behind strict policy + human approval gates
6. Enforce readiness gates in CI/CD or release command
