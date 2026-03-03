# Domia — Roadmap

> Updated after the Phase 20 simplification cleanup.

---

## What was done (Phase 20)

### Dead code removed (~870 LOC, 17 files deleted)

| Category | Files deleted | LOC removed |
|----------|-------------|-------------|
| Recovery system (unreachable) | `RecoveryEligibilityService`, `ManualRecoveryBootstrapService`, `RecoveryReplayService`, `BranchRollbackService`, `RunRecoveryOrchestration` + 4 test files + `RunUseCase.recovery.test.ts` | ~600 |
| Mobile driver stubs | `AndroidDriver`, `IosDriver`, `AndroidDriverProvider`, `IosDriverProvider` | ~100 |
| TrajectoryExportService (never resolved) | `TrajectoryExportService` + test | ~100 |
| Planning coordinators (inlined) | `PlanningCoordinator`, `ReplanningCoordinator` | ~64 |

### Code simplified

- **RunUseCase**: Removed recovery code paths, `recoveryDeps` getter, `performRecoveryReplay()`, `buildRecoveryReplayEvent()`. Planning inlined directly (single `nanoid()` + plan object). Failure-code-to-trigger mapping is now a private static method.
- **ContainerBuilder**: 7 dead registrations removed. `initializePlatformProviders()` only registers web + electron.
- **CLI**: Removed 5 mobile flags (`--app-package`, `--bundle-id`, `--appium-url`, `--device-serial`, `--device-udid`). Removed `recovery_replay` event handler.
- **Validation**: Removed `recoveryMode` and `recoveryRunId` from `RunOptionsSchema`.
- **UI**: Removed `recoveryReplay` from Zustand store, `RunStateView`, `RunTimelineView`, `RunPanel`, `useRunPanel`.
- **Events**: Removed `RecoveryReplayEvent` from `RunEvent` union and `RecoveryReplayTelemetry` type.
- **StepInspector**: Added `toolCall.result` and `toolCall.durationMs` as first-class UI elements in the Raw tab.

### Result

- **Clean compile** (TypeScript strict, `exactOptionalPropertyTypes`)
- **72 / 72 tests passing** (34 tests removed with deleted files)
- Source: ~13,500 LOC across 180 files

---

## Roadmap — Remaining Gaps

### P0 — Near-term (next sprint)

#### 1. Dynamic plugin / skill loading
**Status**: Not started  
**Effort**: Medium (2–3 days)  
**Decision**: Implement a file-based plugin directory (`~/.domia/plugins/`) where each plugin exports a `ToolSpec[]` array. The existing `buildToolCatalog()` already works with `ToolSpec` objects; adding a dynamic loader that scans the plugin directory and merges specs into the catalog is straightforward.

**Implementation sketch**:
```
src/infrastructure/plugins/
  PluginLoader.ts        — scans directory, validates exports via Zod
  PluginRegistry.ts      — singleton, merged into buildToolCatalog()
```

- Plugin format: ESM module default-exporting `ToolSpec[]`
- Validation: Zod schema for ToolSpec (already exists)
- Registration: Called in `ContainerBuilder.registerPlugins()`
- Platform filtering: Reuses existing `platformFilter` on ToolSpec

#### 2. UI component test coverage
**Status**: Not started  
**Effort**: Medium (2–3 days)  
**Decision**: Add Vitest + @testing-library/react tests for critical UI components. Priority order:
1. `RunPanel` — start/cancel flow
2. `StepInspector` — tab switching, data rendering
3. `WorkflowWorkspace` — step execution, DAG rendering
4. `RunForm` — platform switching, validation

Config: Add `vitest.component.config.ts` with jsdom environment.

### P1 — Medium-term (next 2 sprints)

#### 3. Android / iOS drivers
**Status**: Type system ready, stubs removed  
**Effort**: High (1–2 weeks per platform)  
**Decision**: The `PlatformConfig` types (`AndroidPlatformConfig`, `IosPlatformConfig`), validation schemas, and UI form components are **kept** as future extension points. When implementing:
- Create `AndroidDriver` implementing `IAppDriver` using Appium WebDriver
- Create `AndroidDriverProvider` implementing `IAppDriverProvider`
- Register in `ContainerBuilder.initializePlatformProviders()`
- Re-add CLI flags in `RunCommand.ts` and `platformUtils.ts`
- The `AppDriverFactory` provider-registry pattern supports this with zero changes to the core

#### 4. Automatic recovery (re-implementation)
**Status**: Old system deleted (was unreachable)  
**Effort**: Medium-High (3–5 days)  
**Decision**: If recovery is needed, build it properly with:
- A UI "Resume from checkpoint" button in the run history
- A CLI `--resume-run <runId>` flag
- A `RecoveryService` that reads checkpoints via `RunDurabilityService.getCheckpointRecords()` and replays
- The checkpoint infrastructure (`RunDurabilityService`, `CheckpointCompactionService`) is still fully active and recording every step — no data loss from the cleanup

### P2 — Long-term

#### 5. Multi-step planning
**Status**: Removed as dead code (was always single-step)  
**Effort**: High (1–2 weeks)  
**Decision**: When needed, introduce an `IPlanner` interface:
```ts
interface IPlanner {
  plan(goal: string, context: PerceptionContext): Promise<Plan>;
}
```
The `ExecutionGraph` / `Plan` / `PlanItem` domain entities and the DAG execution loop in `RunUseCase` are fully functional and already iterate over multiple plan items. Only the planner itself (LLM-based decomposition) needs building.

#### 6. Workflow templates & marketplace
**Status**: Conceptual  
**Effort**: High  
**Decision**: The `WorkflowDefinitionService` + `WorkflowRunOrchestratorService` already support multi-step workflow definitions stored in SQLite. A template system would add:
- Import/export of workflow YAML definitions
- A UI for browsing/installing community workflows
- Parameterization of workflow steps

---

## Architecture health after cleanup

| Subsystem | Status | Notes |
|-----------|--------|-------|
| Platform drivers (web, electron) | Active | Provider registry pattern, extensible |
| Platform types (android, ios) | Types only | Config types + UI forms kept, no drivers |
| Execution engine | Active | Budget, durability, replanning, completion policies |
| Checkpoint system | Active | RunDurabilityService records every step |
| Perception pipeline | Active | Vision + ARIA sensors, coordinate scaling |
| Tool catalog | Active | 19 tools, 5 catalogs, platform filtering |
| Workflow orchestration | Active | DAG execution, step governance, policies |
| SQLite persistence | Active | 3 migrations, facade pattern |
| Trace / observability | Active | TraceService + FileTraceExporter + DebugExporter |
| Recovery system | Removed | Was unreachable; checkpoint data preserved for future |
| Trajectory export | Removed | Was registered but never used |
| Planning coordinator | Inlined | Single-step plan built directly in RunUseCase |
