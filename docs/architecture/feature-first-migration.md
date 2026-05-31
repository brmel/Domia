# Feature-First Migration — plan & decision (not yet executed)

> Audit §5 found the codebase is **layer-first**: every feature spans 5 top-level trees
> (Run = 79 files across domain/backend/infra/frontend/apps). This is the main "hard to
> work in" driver. This doc is the decision-ready plan. **Not executed** — a half-done
> migration is worse than either end state, so it ships atomically or not at all.

## Target structure (vertical slice per feature)
```
features/<feature>/            e.g. features/run, features/workflow, features/skill
├── domain/                    entities, value-objects, ports, enums OWNED by this feature
├── application/               use-cases, services, queries (the @injectable orchestration)
├── infrastructure/            adapters implementing THIS feature's ports
└── presentation/              ipc router + cli command + react components
shared-kernel/                 cross-feature: ILogger, IEventBus, IConfigService, Result,
                               errors, the SqlJs connection, the platform/automation ports
```

## The hard conflict (why this is not a clean win)
`infrastructure/CLAUDE.md` deliberately makes each infra sub-folder a **unit of replacement**:
`playwright/` = swap browser, `agent-runtime/adk/` = swap LLM, `persistence/` = swap DB. These
are shared by *many* features (Run, Workflow, Skill all drive Playwright + persist to one
SQLite connection). Pure feature-coloc would shatter that swappability and duplicate the
shared `SqlJsConnection` / ADK `InMemorySessionService` singletons.

**Resolution = hybrid, not pure.** Shared adapters (playwright, adk, sqlite, perception)
stay in a cross-feature `shared-kernel/infrastructure`. Only feature-SPECIFIC code moves:
a feature's domain types, its application services, its presentation, and its thin
feature-specific adapters (e.g. `SkillRepositoryAdapter`). So "Run" still uses the shared
Playwright adapter — it just owns its own services/ports/UI in `features/run/`.

## Tracer: `skill` (smallest cohesive feature, ~13 files)
Move first to prove the pattern with lowest risk:
| layer today | → features/skill/ |
|---|---|
| `domain/entities/Skill.ts`, `SkillId` VO, `ports/ISkillRepository.ts`, `ISkillPlayback.ts` | `domain/` |
| `backend/skills/{SkillsAppService,SkillExtractionService,SkillPlaybackService,SkillsQueries}` | `application/` |
| `infrastructure/skills/SkillRunnerService.ts`, `persistence/SkillRepositoryAdapter.ts`, `SQLiteSkillRepository.ts` | `infrastructure/` |
| `apps/cli/SkillsCommand.ts`, `apps/desktop/ipc/routers/skillsRouter.ts`, frontend skills UI | `presentation/` |
Shared `SqlJsConnection` stays in kernel; `SQLiteSkillRepository` takes it by injection (already does).

## Cost / risk (measured constraints)
- **DI:** registration count unchanged; the container must load shared-kernel first, then features. `ContainerBuilder` reorganizes but doesn't shrink.
- **Persistence:** one `SqlJsConnection` is process-global → stays in kernel; feature repos import it. Persistence ends up half-feature, half-kernel.
- **CI guard:** `check-architecture` goes from 7 flat rules to a per-feature matrix needing **two** orthogonal checks — intra-feature altitude AND inter-feature isolation with an allow-list (`workflow→run`, `skill→run`, `*→shared-kernel` are legit). ~3× the current script. Build it in report-only mode first.
- **Domain purity:** today "`domain/` imports nothing outward" is one trivially-enforced scope and a real strength. After, it's N `features/*/domain` scopes; must police that `run/domain` doesn't import `platform/domain` (→ shared-kernel) or the tangle returns.
- **Tests:** `tests/e2e/{runs,workflow,...}` already feature-aligned; no-mock e2e boot the whole container so they stay top-level.

## Phased execution (atomic per phase, each gated)
- **P0 (prereq, safe now):** split `domain/ports` flat barrel by context (`ports/{run,automation,persistence,perception,reporting}/`) — the deferred audit #3. Pure moves, tsc-verified. Localizes the fan-in-60.
- **P1:** write the allow-listed inter-feature dependency checker; run **report-only** against today's tree to baseline.
- **P2:** carve `features/skill/` (tracer). Validate gates + the new guard. Get team sign-off on the shape.
- **P3:** establish `shared-kernel/`; move the shared ports/adapters/connection.
- **P4:** migrate the rest, `run` LAST (workflow depends on run).

## Recommendation
**Do NOT migrate yet unless team-scale justifies it.** Today the backend bounded-contexts
(`backend/runs|workflows|skills|…`) + `frontend/features/*` + feature-aligned tests already
deliver ~70% of the navigability benefit. Full migration is warranted when: (a) >3 engineers
hit merge contention on the layer folders, or (b) features need independent
build/test/ownership. Until then it is churn against a clean, swappable, CI-enforced base —
the audit's measured verdict. Revisit with this plan when a trigger fires.
