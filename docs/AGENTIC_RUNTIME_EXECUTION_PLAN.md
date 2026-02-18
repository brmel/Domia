# Agentic Runtime Execution Plan (Domia)

## Purpose
This document is the implementation roadmap to evolve Domia into a **natively agentic**, robust, and maintainable runtime.

It translates architecture goals into concrete phases and tasks. For each task, it answers:
- How to implement it
- Why it is better
- How it simplifies the codebase
- How it improves robustness, modularity, and maintainability

---

## Non-Negotiable Principles (Must Stay True)
1. **Model decides actions/tools** within allowed capabilities; runtime does not script tactical choices.
2. **Runtime enforces guardrails** (schema, safety, budgets, policy), not behavior micromanagement.
3. **Planner is strategic**, actor is tactical, evaluator is adjudicative.
4. **Single lifecycle owner** for run state transitions.
5. **Typed failure semantics** for all LLM and execution paths.
6. **Declarative policy** over hardcoded constants and branch-heavy logic.

---

## Current Baseline (Why This Plan Exists)
Observed architecture pain points:
- Orchestration is split across many layers/services.
- LLM failures (especially missing tool-call output) propagate as brittle terminal errors.
- Some tactical behavior is still hardcoded in runtime branches.
- Tool/action contracts exist but are partially static and duplicated.
- Governance/policy logic is distributed and partly embedded in service code.

---

# PHASE 0 — Contract First (Alignment + Acceptance Criteria)

## Task 0.1 — Create Agentic Runtime Contract

### How to implement
- Add a short architecture contract section to this file and reference it from `docs/ARCHITECTURE.md`.
- Define runtime invariants:
  - model owns action choice
  - runtime owns safety and contracts
  - planner/evaluator roles are distinct
  - no tactical hardcoding except explicit safety kill-switches
- Add measurable acceptance criteria (e.g., “no deterministic tool substitution in normal path”).

### Why it is better
- Prevents ambiguous decisions during refactors.
- Gives one shared definition of “native agentic.”

### How it simplifies code
- Reduces ad-hoc patches that conflict with long-term direction.
- Makes implementation review binary (contract-compliant vs non-compliant).

### Robust / modular / maintainable impact
- Robustness: lower risk of regressions caused by inconsistent decisions.
- Modularity: clear boundaries between model intelligence and runtime governance.
- Maintainability: easier onboarding and architecture continuity.

---

## Task 0.2 — Add Contract Validation Checklist

### How to implement
- Add a checklist section for each PR touching runtime:
  - action autonomy preserved
  - failure semantics typed
  - policy still declarative
  - no new tactical hardcoding

### Why it is better
- Keeps architecture quality enforceable.

### How it simplifies code
- Stops architectural drift before merge.

### Robust / modular / maintainable impact
- Robustness: catches systemic issues early.
- Modularity: protects service boundaries.
- Maintainability: avoids rework loops.

---

# PHASE 1 — Normalize LLM Decision Boundaries (Highest Priority)

## Task 1.1 — Introduce Typed LLM Decision Result

### How to implement
- Define a unified result type for planning/action/evaluation calls:
  - `success`
  - `recoverable_error` (e.g., no tool call, malformed args, transient provider)
  - `terminal_error` (e.g., unsupported model capability)
- Replace ad-hoc thrown errors with typed returns at provider/adapter boundary.

### Why it is better
- Failure handling becomes deterministic and policy-driven.

### How it simplifies code
- Removes scattered string parsing and conditional error handling.
- Reduces duplicated retry logic.

### Robust / modular / maintainable impact
- Robustness: resilient handling for known failure classes.
- Modularity: clean contract between LLM adapter and runtime.
- Maintainability: easier to extend providers/models.

---

## Task 1.2 — Centralize Retry + Fallback Policy for Tool-Calling Failures

### How to implement
- Add one policy handler for LLM decision failures.
- Policy maps error type -> action:
  - retry same prompt
  - retry with correction hint
  - escalate to replan
  - terminalize with typed reason
- Ensure this is called by the runtime kernel only.

### Why it is better
- Consistent behavior across all runs/workflows.

### How it simplifies code
- Removes retry/fallback duplication in multiple services.

### Robust / modular / maintainable impact
- Robustness: fewer random terminal crashes.
- Modularity: single policy module owns fallback strategy.
- Maintainability: policy tuning without touching execution logic.

---

## Task 1.3 — Emit Structured Failure Telemetry

### How to implement
- Add typed telemetry fields for LLM failures and transitions.
- Track frequencies: `no_tool_call`, schema_invalid, transient_provider, etc.

### Why it is better
- Enables data-driven stabilization.

### How it simplifies code
- Reduces manual log forensics.

### Robust / modular / maintainable impact
- Robustness: faster root-cause detection.
- Modularity: observability separated from execution semantics.
- Maintainability: supports safe refactoring by metrics.

---

# PHASE 2 — Make Planning Truly Agent-Led

## Task 2.1 — Define Structured Plan Schema

### How to implement
- Upgrade plan items to include:
  - `objective`
  - `success_criteria`
  - `evidence_expectations`
  - `constraints`
- Keep plan tactical details minimal (no forced click strategy in planner output).

### Why it is better
- Improves planner quality and transferability across UIs.

### How it simplifies code
- Prevents planner/actor overlap and duplicated logic.

### Robust / modular / maintainable impact
- Robustness: better adaptation to dynamic pages.
- Modularity: planner contract independent from executor details.
- Maintainability: clean schema evolution over time.

---

## Task 2.2 — Feed Evaluator Advice as Context Delta (Not Full Rewrites)

### How to implement
- Pass evaluator advice as structured context for selective replan.
- Replan only affected nodes/subgoals when possible.

### Why it is better
- Minimizes unnecessary plan churn.

### How it simplifies code
- Avoids full-plan resets and repeated steps.

### Robust / modular / maintainable impact
- Robustness: fewer loops and less thrashing.
- Modularity: replanner separated from full planner.
- Maintainability: easier debugging of plan evolution.

---

## Task 2.3 — Enforce Role Separation in Prompts

### How to implement
- Planner prompt: decomposition only.
- Actor prompt: choose next tool call from current state.
- Evaluator prompt: classify outcome and advice.
- Remove cross-role instructions and duplicated rules.

### Why it is better
- Reduces role confusion and contradictory model behavior.

### How it simplifies code
- Smaller prompts, cleaner prompt builders.

### Robust / modular / maintainable impact
- Robustness: more stable model outputs.
- Modularity: each role evolves independently.
- Maintainability: prompt tuning with lower blast radius.

---

# PHASE 3 — Remove Tactical Hardcoding from Runtime Loop

## Task 3.1 — Replace Deterministic Action Rewrites with Optional Hints

### How to implement
- Remove automatic tactical rewrites (except safety kill-switches).
- If needed, pass non-binding hints in context (e.g., repeated click observed).

### Why it is better
- Preserves model autonomy while still surfacing useful signal.

### How it simplifies code
- Reduces branch-heavy tactical logic in executor.

### Robust / modular / maintainable impact
- Robustness: behavior generalizes better across apps and languages.
- Modularity: tactical reasoning remains in model decision layer.
- Maintainability: fewer hidden side effects in execution.

---

## Task 3.2 — Keep Safety Overrides Explicit and Minimal

### How to implement
- Maintain only policy-critical overrides:
  - dangerous domain/action blocks
  - max budget exhaustion
  - strict schema rejection
- Document every override and rationale.

### Why it is better
- Balances autonomy and safe operation.

### How it simplifies code
- Clarifies what is “hardcoded by policy” vs “agent decision.”

### Robust / modular / maintainable impact
- Robustness: protects against harmful actions.
- Modularity: safety in dedicated policy modules.
- Maintainability: safe to audit and evolve.

---

## Task 3.3 — Make Evidence Quality the Driver for Pass/Retry/Replan

### How to implement
- Require evaluator to justify decisions with evidence and confidence thresholds.
- Use execution observations (e.g., extracted text) as first-class evidence inputs.

### Why it is better
- Decisions become grounded and explainable.

### How it simplifies code
- Reduces subjective pass/fail heuristics in runtime code.

### Robust / modular / maintainable impact
- Robustness: fewer false positives in task completion.
- Modularity: evidence handling is explicit and reusable.
- Maintainability: easier test assertions for outcomes.

---

# PHASE 4 — Unify Runtime Orchestration into One Kernel

## Task 4.1 — Introduce Single Runtime Lifecycle Engine

### How to implement
- Consolidate run stages into one lifecycle owner:
  - initialize
  - plan
  - execute/evaluate loop
  - replan
  - terminalize
- Keep workflow layer as thin orchestrator over this engine.

### Why it is better
- One source of truth for transitions.

### How it simplifies code
- Removes duplicated lifecycle handling across services.

### Robust / modular / maintainable impact
- Robustness: fewer state divergence bugs.
- Modularity: clear separation between engine and integrations.
- Maintainability: easier to reason about run behavior.

---

## Task 4.2 — Collapse Coordinator Sprawl into 2 Modules

### How to implement
- Merge coordinator responsibilities into:
  - `PlanningModule`
  - `ExecutionModule`
- Keep pure transformation helpers stateless.

### Why it is better
- Reduces indirection and dependency chains.

### How it simplifies code
- Fewer classes and constructor dependencies.

### Robust / modular / maintainable impact
- Robustness: less cross-service orchestration failure.
- Modularity: module boundaries around stable responsibilities.
- Maintainability: easier refactor and test setup.

---

## Task 4.3 — Make Workflow and Single-Run Share Exactly the Same Engine

### How to implement
- Use runtime engine for each workflow step execution.
- Keep workflow-specific concerns limited to graph scheduling and persistence.

### Why it is better
- Fixes and policies apply uniformly.

### How it simplifies code
- Eliminates duplicate execution semantics.

### Robust / modular / maintainable impact
- Robustness: lower mismatch risk between modes.
- Modularity: clean adapter pattern for workflow orchestration.
- Maintainability: one execution path to harden.

---

# PHASE 5 — Dynamic Capability + Tool Registry

## Task 5.1 — Build Runtime Tool Set from Capability Negotiation

### How to implement
- Generate available tool definitions at runtime from platform + policy + context.
- Remove duplicated static tool lists from prompt and mapper layers.

### Why it is better
- Model sees only valid tools for current environment.

### How it simplifies code
- Eliminates mismatched source-of-truth for tool availability.

### Robust / modular / maintainable impact
- Robustness: fewer invalid tool calls.
- Modularity: tool registry decoupled from prompt text.
- Maintainability: easy platform extension.

---

## Task 5.2 — Keep Tool Schemas Strict, Capability Exposure Dynamic

### How to implement
- Keep zod/typed schema validation strict.
- Dynamically expose/hide tools per context while preserving stable schema contracts.

### Why it is better
- Strong safety + flexible behavior.

### How it simplifies code
- Avoids branching in executor for unsupported actions.

### Robust / modular / maintainable impact
- Robustness: better invalid-call prevention.
- Modularity: clean boundary between exposure and validation.
- Maintainability: easier schema evolution.

---

## Task 5.3 — Add Tool Metadata for Planning/Evaluation Context

### How to implement
- Extend tool descriptors with:
  - preconditions
  - side-effects
  - cost/risk hints
- Include concise metadata in actor prompt context.

### Why it is better
- Improves model tool selection quality.

### How it simplifies code
- Reduces need for runtime tactical correction logic.

### Robust / modular / maintainable impact
- Robustness: fewer poor action choices.
- Modularity: metadata-driven behavior tuning.
- Maintainability: policy changes via descriptor updates.

---

# PHASE 6 — Declarative Governance and Policy Unification

## Task 6.1 — Externalize Policy Constants

### How to implement
- Move replanning limits, capability matrix, verification thresholds into config-backed policy objects.
- Keep defaults but allow environment/runtime overrides.

### Why it is better
- Faster tuning without redeploying code logic.

### How it simplifies code
- Removes magic numbers and scattered constants.

### Robust / modular / maintainable impact
- Robustness: policy can adapt to platform reality.
- Modularity: policy modules become data-driven.
- Maintainability: safer long-term governance.

---

## Task 6.2 — Introduce Unified Step Admission Decision

### How to implement
- Compose readiness + capability + skill trust + plugin authorization into a single decision envelope:
  - allow
  - deny(reason)
  - allow_degraded(warnings)

### Why it is better
- One transparent gate before execution.

### How it simplifies code
- Replaces scattered preflight checks.

### Robust / modular / maintainable impact
- Robustness: consistent deny/degrade behavior.
- Modularity: governance as standalone module.
- Maintainability: easier audits and policy traceability.

---

## Task 6.3 — Emit Policy Reason Chains in Telemetry

### How to implement
- Include policy reasons in workflow and run events.
- Preserve reason chain through terminalization.

### Why it is better
- Explains “why blocked/degraded” without code digging.

### How it simplifies code
- Reduces manual debugging and repeated reproductions.

### Robust / modular / maintainable impact
- Robustness: faster operational recovery.
- Modularity: observability independent from business logic.
- Maintainability: improves supportability.

---

# PHASE 7 — Refactor Step Executor by Responsibility

## Task 7.1 — Split Step Loop into Perceive/Decide/Act/Evaluate Units

### How to implement
- Break large step method into composable units:
  - `PerceptionUnit`
  - `DecisionUnit`
  - `ActionUnit`
  - `EvaluationUnit`
- Keep shared state typed and minimal.

### Why it is better
- Improves readability and test focus.

### How it simplifies code
- Smaller methods, fewer nested branches.

### Robust / modular / maintainable impact
- Robustness: fewer side-effect interactions.
- Modularity: unit-level substitutions are easy.
- Maintainability: isolated regressions and faster fixes.

---

## Task 7.2 — Centralize Evidence Blackboard Usage

### How to implement
- Standardize evidence write/read lifecycle per step.
- Define evidence normalization helpers for extract/action outcomes.

### Why it is better
- Decisions are based on coherent evidence.

### How it simplifies code
- Removes duplicate evidence formatting logic.

### Robust / modular / maintainable impact
- Robustness: higher decision consistency.
- Modularity: evidence system reusable by evaluator/replanner.
- Maintainability: easier evidence debugging.

---

## Task 7.3 — Harden Lifecycle Recovery Hooks in Browser Adapter

### How to implement
- Keep page/session crash hooks centralized and tested.
- Surface recoverability state to runtime as typed signals.

### Why it is better
- Better resilience to browser lifecycle instability.

### How it simplifies code
- Runtime no longer guesses driver/session states.

### Robust / modular / maintainable impact
- Robustness: fewer crash-induced run failures.
- Modularity: adapter owns platform-specific recovery.
- Maintainability: less platform leakage into core runtime.

---

# PHASE 8 — DI and Module Boundary Cleanup

## Task 8.1 — Replace Monolithic Composition Root with Feature Registries

### How to implement
- Split container setup into:
  - runtime module
  - llm module
  - workflow module
  - platform module
  - observability module
- Keep top-level root as assembly only.

### Why it is better
- Clear ownership and reduced startup complexity.

### How it simplifies code
- Smaller registration files and cleaner dependency graphs.

### Robust / modular / maintainable impact
- Robustness: fewer accidental wiring regressions.
- Modularity: independent module evolution.
- Maintainability: easier to audit and test DI wiring.

---

## Task 8.2 — Introduce Interface Contracts for High-Churn Boundaries

### How to implement
- Define explicit interfaces for:
  - runtime kernel
  - LLM gateway
  - policy gateway
  - capability registry

### Why it is better
- Enables implementation swaps without ripple effects.

### How it simplifies code
- Reduces concrete class coupling.

### Robust / modular / maintainable impact
- Robustness: lower breakage during refactor.
- Modularity: plug-in style component replacement.
- Maintainability: stable architectural seams.

---

## Task 8.3 — Enforce Dependency Direction Rules

### How to implement
- Domain <- Application <- Infrastructure dependency direction checks.
- Prohibit reverse imports in CI checks.

### Why it is better
- Prevents architecture erosion.

### How it simplifies code
- Keeps boundaries predictable.

### Robust / modular / maintainable impact
- Robustness: less hidden coupling risk.
- Modularity: stronger package boundaries.
- Maintainability: long-term architecture integrity.

---

# PHASE 9 — Regression Net and Rollout Strategy

## Task 9.1 — Add Agenticity Contract Tests

### How to implement
- Add tests that fail if runtime introduces deterministic tactical tool rewrites (except explicit safety override paths).
- Add assertions for planner/actor/evaluator role separation.

### Why it is better
- Protects your critical requirement permanently.

### How it simplifies code
- Prevents hidden behavior drift and rollback churn.

### Robust / modular / maintainable impact
- Robustness: keeps architecture behavior stable across releases.
- Modularity: each role contract testable in isolation.
- Maintainability: guards against regression from future features.

---

## Task 9.2 — Add Failure-Mode and Recovery Tests

### How to implement
- Test all key LLM error classes and expected policy outcomes.
- Include no-tool-call and malformed-args cases.

### Why it is better
- Converts today’s production failures into explicit known behavior.

### How it simplifies code
- Reduces manual QA iterations for edge cases.

### Robust / modular / maintainable impact
- Robustness: reliable failover behavior.
- Modularity: test fixtures reusable across adapters.
- Maintainability: confidence for incremental change.

---

## Task 9.3 — Staged Rollout with Feature Flags and SLO Gates

### How to implement
- Roll out runtime kernel and LLM gateway changes behind flags.
- Compare old/new paths in shadow mode.
- Promote only when SLOs are stable:
  - tool-call validity
  - retry rate
  - terminal failure rate
  - multilingual verification pass rate

### Why it is better
- Low-risk migration for critical runtime.

### How it simplifies code
- Avoids emergency hotfix complexity from big-bang deployment.

### Robust / modular / maintainable impact
- Robustness: controlled production hardening.
- Modularity: feature-flagged modules can be isolated.
- Maintainability: reversible rollout path.

---

## Suggested Delivery Cadence
- **Sprint 1:** Phase 0 + Phase 1
- **Sprint 2:** Phase 2 + Phase 3
- **Sprint 3:** Phase 4 + Phase 5
- **Sprint 4:** Phase 6 + Phase 7
- **Sprint 5:** Phase 8 + Phase 9

---

## Definition of Done (Program-Level)
This roadmap is complete when:
1. Runtime is model-led for planning and action/tool choice.
2. Hardcoded tactical behavior is removed except explicit policy kill-switches.
3. Failure semantics are typed and policy-driven.
4. Workflow and standalone runs share one execution engine.
5. Policies are declarative/configurable.
6. Agenticity contract tests are green and enforced in CI.

---

## Execution Tracking Template (Copy per Task)
- **Owner:**
- **Status:** not started / in progress / blocked / done
- **PR(s):**
- **Scope:**
- **Risks:**
- **Acceptance checks:**
  - [ ] implementation completed
  - [ ] simplification goals met
  - [ ] robustness/modularity criteria met
  - [ ] tests added/updated
  - [ ] telemetry validated
