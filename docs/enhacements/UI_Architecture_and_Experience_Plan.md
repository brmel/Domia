# UI Architecture and Experience Plan (Feature-Heavy + Plugin-Ready)

## Purpose
Define the target product experience for Domia as capabilities scale (durability, temporal analysis, skills, plugins, governance), while keeping the UI understandable and safe.

## UX Principles
- Progressive disclosure: basic flows first, advanced controls only when needed.
- Safety by design: risky capabilities are visibly gated, never hidden.
- Explainability: every autonomous decision is inspectable.
- Operator-first workflows: optimize for test authoring, run supervision, triage, and replay.
- Scalable IA: adding a new plugin or skill does not require navigation redesign.

## Information Architecture

### Primary Navigation
1. Runs
2. Compose
3. Skills
4. Plugins
5. Governance
6. Observability
7. Settings

### Why this structure
- Day-to-day work starts in Runs and Compose.
- Reuse systems (Skills, Plugins) are managed separately from run execution.
- Governance and Observability stay first-class for enterprise operation.

## Core Screens

### 1) Runs (default landing)
- Run list with status, lane, duration, target, and terminal reason.
- Saved filters: active, failed, long-running, readiness-blocked.
- Right-side details drawer with timeline, checkpoints, policy decisions, and artifacts.
- Primary CTA: Open Run Workspace.

### 2) Run Workspace (single run control center)
- Header: state badge, elapsed time, budget usage, stop/pause/resume controls.
- Center: live activity stream (plan step, action, tool/plugin invocation, assertion updates).
- Left rail tabs: Plan, State, Timeline, Checkpoints, Skills used, Plugins used.
- Right rail tabs: Safety (policy decisions), Readiness, Logs.
- Footer: terminal summary and replay/clone actions.

### 3) Compose (test authoring)
- Prompt + target config in one pane.
- Advanced panel (collapsed by default): budget limits, temporal mode, recovery mode, skill preference, plugin preflight.
- Validation hints before run start (readiness checks in observe mode).

### 4) Skills
- Registry table: id, version, trust, health, last-used.
- Skill detail: schema, preconditions/postconditions, sample invocations, outcome history.
- Promotion workflow: draft -> verified with audit metadata.

### 5) Plugins
- Plugin catalog table: name, trust, capabilities, status, last activity.
- Capability matrix per plugin (read/exec/write/device control).
- Approval settings for escalation-required capabilities.
- Runtime page for connection state and rate-limit/kill-switch controls.

### 6) Governance
- Policy editor (versioned): allow/deny/escalate rules for tools, skills, plugins.
- Simulate decision panel for a hypothetical invocation.
- Approval queue for escalated operations.

### 7) Observability
- Time-series cards: pass rate, median run duration, retry rate, token estimate, temporal overhead.
- Drill-down into failure clusters and policy denials.
- Exportable audit trail for compliance.

## Interaction Model for Complexity

### Progressive levels
- Basic mode: prompt, target, run controls, summary only.
- Advanced mode: temporal/recovery/skills/plugins and policy details.
- Operator mode: full governance + observability + approvals.

### Contextual surfacing
- Show plugin controls only when plugin flags/options are active.
- Show temporal timeline tab only when temporal observation is enabled.
- Show recovery actions only for runs with checkpoints/read model eligibility.

## Plugin UX Pattern (for many plugins)
- Use a capability-first view, not plugin-type-first.
- Plugins must declare trust + capabilities in manifest-derived cards.
- Invocation UI always shows: requested capability, policy result, and approval requirement.
- High-risk capabilities display friction steps (reason + optional approver note).

## Visual Design Direction
- Dense-but-readable workspace layout: tri-pane for run operations.
- Consistent semantic badges: state, trust level, risk level, policy decision.
- Distinct status tokens for observe vs soft-enforce modes.
- Timeline visualization as compact event lanes (actions, snapshots, policy decisions).

## Accessibility and Operability
- Keyboard-first navigation for run controls and approval queue.
- All status indicators include text labels (not color-only).
- Screen-reader-friendly live region for run event stream.
- Deterministic ordering in event lists for reliable debugging.

## Suggested Delivery Phases (UI)

### UI-1 Foundation (now)
- Add navigation shell and route placeholders for all primary sections.
- Build Runs list + basic Run Workspace with event stream.

### UI-2 Execution Visibility
- Add Plan/State/Checkpoints tabs.
- Add readiness + policy decision panels.

### UI-3 Advanced Capability UX
- Add temporal timeline tab.
- Add Skills and Plugins registry views.
- Add capability approval interactions.

### UI-4 Governance + Observability
- Add policy simulation and approval queue.
- Add observability dashboards and audit exports.

## Acceptance Criteria
- Operators can start, supervise, and triage runs without leaving Run Workspace.
- Any blocked/escalated action is explainable in <= 2 clicks.
- New plugin onboarding requires zero navigation changes.
- Advanced controls stay hidden by default but discoverable.
- UI remains stable when all advanced feature flags are disabled.

## Immediate Next UI Tasks
1. Create wireframes for Runs, Run Workspace, Plugins, Governance.
2. Define component contracts for event stream rows, policy badges, capability chips.
3. Map existing runtime signals to UI view models.
4. Add feature-flag-aware rendering rules in presentation layer.
