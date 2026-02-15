# Industry Readiness Enhancement Plan

## Purpose

This plan defines a high-level architecture and delivery strategy to prepare Domia for advanced enterprise use cases:

1. Long-running, complex multi-step tests
2. High-frequency temporal snapshots for fast UI behavior analysis
3. Reusable skills to avoid repeating prompts/workflows
4. Secure plugins (SSH, disk, external devices)

This document is intentionally **design-first** and **pre-implementation**.
The goal is to prepare the codebase structure, boundaries, contracts, controls, and observability so implementation can be done safely and incrementally later.

---

## Design Principles

- **Durable by default**: every run can pause/resume/recover.
- **Policy first**: all powerful capabilities require explicit authorization.
- **Least privilege**: no broad access; capabilities are scoped and time-bound.
- **Deterministic orchestration**: single terminal path, idempotent side effects.
- **Composable architecture**: features are independent modules with typed contracts.
- **Cost-aware runtime**: latency/token/compute budgets built into orchestration.
- **Auditability**: event logs and traceability for every critical decision/action.

---

## Target Architecture (High-Level)

### New/Extended Runtime Subsystems

1. **Workflow Orchestrator (Durable Runtime)**
   - Manages long-horizon execution state and checkpoints.
   - Supports retries, pauses, resumes, and bounded replanning.

2. **Temporal Observation Engine**
   - Captures snapshot streams (not only single snapshot).
   - Produces compressed timeline context for the LLM.

3. **Skill Runtime + Registry**
   - Defines reusable, typed macro-capabilities with pre/post conditions.
   - Enables discoverable and versioned behavior reuse.

4. **Plugin Capability Gateway**
   - Hosts external capability adapters (SSH, disk, device).
   - Enforces capability-based authorization and policy checks.

5. **Policy & Governance Plane**
   - Central policy evaluation for tool/plugin/skill actions.
   - Supports allow/deny/escalate-to-human decisions.

6. **Observability & Audit Plane**
   - Event-sourced execution logs + projections for debugging and compliance.
   - Reliability SLOs and security telemetry.

7. **Operator Experience Plane (UI)**
  - Provides a scalable control center for runs, skills, plugins, governance, and observability.
  - Uses progressive disclosure so advanced controls do not overload baseline workflows.

---

## Roadmap Overview

- **Phase 1**: Durable orchestration and control-plane foundations
- **Phase 2**: Temporal snapshots and timeline context
- **Phase 3**: Skills framework
- **Phase 4**: Plugin system with capability-based security
- **Phase 5**: Hardening, validation, and enterprise readiness

Each phase below focuses first on architecture preparation and interfaces, not full behavior implementation.

UI and operator workflows are defined in `UI_Architecture_and_Experience_Plan.md` and should progress in lockstep with runtime phases.

---

## Phase 1 — Durable Orchestration Foundations (Start Here)

### Objective
Prepare the runtime to safely execute long and complex tests with deterministic lifecycle behavior.

### High-Level Design

- Introduce a **Run State Machine** with explicit states/transitions:
  - `initialized -> planning -> executing -> paused -> resumed -> completed|failed|cancelled`
- Add **durable checkpoints** at key boundaries:
  - after plan creation
  - after milestone completion
  - after each action execution result
- Define **Execution Budget Contracts**:
  - max actions, max wall-clock, max retries, max token budget
- Add **Replanning Contract**:
  - trigger conditions (stagnation/loop/failure threshold)
  - bounded replanning count per run
- Add **idempotency keys** for side-effect actions to avoid duplication on recovery.

### Preparation Deliverables (No full implementation yet)

- New run lifecycle contract interfaces (state + checkpoint schemas)
- Persistence schema additions for checkpoints and lifecycle events
- Orchestration policy interfaces for budget and retry decisions
- Standardized terminal outcome contract and reason codes
- Replay/recovery design doc and sequence diagrams

### Controls

- Deterministic single terminal event per run
- Explicit max budgets and stop reasons
- Queue/lane serialization maintained for same target lane
- Recovery path never replays non-idempotent actions without guard

### Exit Criteria

- State machine and checkpoint schema approved
- Recovery/replay behavior documented with examples
- No runtime behavior change required yet beyond contract scaffolding

---

## Phase 2 — Temporal Observation Engine

### Objective
Prepare the system to capture and reason over fast-changing behaviors using timeline snapshots.

### High-Level Design

- Add **dual-rate capture model**:
  - baseline sampling (low frequency)
  - burst sampling (high frequency on trigger windows)
- Define **Trigger Policies** for burst mode:
  - interaction-in-progress
  - DOM mutation velocity threshold
  - animation/transition detection
  - recent assertion mismatch
- Introduce **Timeline Context Assembler**:
  - keeps recent N frames + compressed deltas
  - includes interval metadata and event annotations
- Introduce **Observation Budgeting**:
  - max fps
  - max snapshot bytes
  - max prompt token share for timeline context

### Preparation Deliverables

- Temporal capture contracts (`SnapshotFrame`, `SnapshotTimeline`, `TimelineSummary`)
- Config schema for sampling rates and burst triggers
- Prompt-context strategy for timeline windows and delta summaries
- Storage plan for diff-based frame persistence and pruning policy

### Controls

- Backpressure queue to prevent capture overload
- Data retention limits and pruning windows
- Privacy filter hooks before snapshot persistence/export
- Prompt budget guards to avoid context explosion

### Exit Criteria

- Observation contract integrated into domain/application ports
- End-to-end timeline data-flow design reviewed
- No mandatory model-level tuning required in this phase

---

## Phase 3 — Skills Framework

### Objective
Prepare reusable, governed skill execution to reduce repeated prompts and increase consistency.

### High-Level Design

- Create a **Skill Definition Model**:
  - identity, version, input schema, output schema, preconditions, postconditions
- Add **Skill Registry**:
  - discovery, compatibility checks, lifecycle (`draft`, `verified`, `deprecated`)
- Add **Skill Executor**:
  - skill-as-macro translating to bounded internal action graph
- Add **Skill Selection Layer**:
  - planner can pick skills based on context and confidence
- Add **Skill Memory**:
  - historical execution outcomes and reliability metadata

### Preparation Deliverables

- Skill interfaces and registry contracts
- Skill packaging/versioning convention
- Validation rules for preconditions/postconditions
- Governance model for skill promotion (draft -> verified)

### Controls

- Skill allowlist per project/environment
- Skill-level budget and timeout constraints
- Skill fallback strategy when preconditions fail
- Mandatory audit trail for skill invocation and outputs

### Exit Criteria

- Skill API and lifecycle governance agreed
- Registry and executor interfaces ready for incremental skill addition

---

## Phase 4 — Plugin Capability Gateway (SSH, Disk, Devices)

### Objective
Prepare a secure plugin ecosystem with strict controls and extensible capability boundaries.

### High-Level Design

- Define **Capability Taxonomy** (examples):
  - `ssh.read`, `ssh.exec`
  - `fs.read`, `fs.write`
  - `device.connect`, `device.read`, `device.control`
- Build **Plugin Manifest Contract**:
  - declared capabilities, network needs, storage needs, trust level
- Add **Plugin Runtime Boundary**:
  - isolated execution context
  - explicit host-API surface
- Add **Authorization Flow**:
  - policy evaluation + optional human approval for sensitive actions
- Add **Connector Abstraction**:
  - plugin implementations for SSH/disk/device adhere to same execution contract

### Preparation Deliverables

- Plugin manifest schema and lifecycle model
- Capability authorization interfaces and decision contracts
- Security architecture (sandbox boundary, secrets handling, isolation)
- Plugin event/audit log schema

### Controls

- Deny-by-default capability policy
- Time-limited, scoped credentials only
- Per-plugin rate limits and kill switch
- Human approval gates for destructive/high-risk actions
- No unrestricted raw host access

### Exit Criteria

- Plugin gateway contracts approved by architecture/security review
- Baseline governance + incident response playbook drafted

---

## Phase 5 — Hardening & Enterprise Readiness

### Objective
Validate reliability, safety, performance, and operability before large-scale rollout.

### High-Level Design

- Reliability test plans:
  - chaos/fault-injection for retries and checkpoint recovery
  - long-run soak tests
- Security validation:
  - policy bypass tests
  - plugin boundary escape tests
  - credential leakage checks
- Performance validation:
  - throughput/latency under concurrent runs
  - temporal capture overhead benchmarks
- Operational readiness:
  - SLOs, alerts, dashboards, runbooks

### Preparation Deliverables

- Test matrix for reliability/security/performance
- SLO definitions and alert thresholds
- Rollout strategy (canary + feature flags)
- Incident response and rollback procedures

### Controls

- Release gates require all critical checks passing
- Feature flags default off for new advanced capabilities
- Production policy baselines versioned and reviewed

### Exit Criteria

- Release checklist signed off
- Controlled production adoption path approved

---

## Cross-Cutting Governance Model

### Policy Decision Levels

- **Allow**: low-risk, in-policy actions
- **Deny**: explicit forbidden action/capability
- **Escalate**: requires human approval
- **Audit-only**: permitted with enhanced logging

### Required Audit Events

- run state transition
- checkpoint written/restored
- tool/skill/plugin invocation start/end
- policy decision and reason
- retry/replan event
- terminal run result

### Core Budgets (global defaults, configurable)

- max run duration
- max action count
- max retries per boundary
- max token budget per step/run
- max snapshot throughput and retention

---

## Risks and Mitigations

1. **State complexity growth**
   - Mitigation: strict state machine + contract tests + replay specs.

2. **Temporal data cost explosion**
   - Mitigation: delta compression, windowing, hard budgets.

3. **Skill drift and hidden failure modes**
   - Mitigation: skill lifecycle governance, version pinning, telemetry.

4. **Plugin security blast radius**
   - Mitigation: capability-based permissions, sandboxing, deny-by-default.

---

## Suggested Start Scope for Phase 1 (Immediate Next Work)

1. Define run state machine contract and terminal codes.
2. Define checkpoint/event schemas and storage extension plan.
3. Add orchestration budget policy interfaces (no behavior-heavy implementation).
4. Add replay/recovery sequence design docs and failure taxonomy.
5. Add architecture tests that validate contract transitions (non-functional scaffolding).

This keeps the team in a safe design-preparation mode while creating a strong foundation for all later phases.

---

## Decision Record

When this plan is approved, create one ADR per phase with:

- scope and non-goals
- interfaces/contracts
- policy controls
- observability requirements
- test strategy and release gates

After ADR approval, implementation begins with **Phase 1**.
