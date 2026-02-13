# Domia Product Roadmap

> **Vision**: Domia is an autonomous, cross-platform testing agent that converts human intent into resilient, explainable, end-to-end tests across web, Electron, mobile, and selected desktop applications.

This roadmap balances **long-term vision** with **concrete, shippable milestones**. Each phase delivers real user value while laying foundations for the next.

---

## Guiding Principles

1. **Intent over implementation** – Users describe *what* they want, Domia decides *how*.
2. **Durability by default** – Tests persist, recover, and explain themselves.
3. **Platform-agnostic core** – Platform specifics live in adapters, never in domain logic.
4. **Trust through transparency** – Every action is explainable and replayable.
5. **Progressive complexity** – Support harder platforms only when abstractions are ready.

---

# Phase 1 — Web & Electron Dominance (Foundation)

**Goal**: Make Domia the best autonomous testing agent for modern web and Electron apps.

### Outcomes

* Production-ready SaaS usage
* CI/CD adoption
* Clear differentiation from script-based tools

---

## 1.1 Core Domain Hardening

### Objectives

* Stabilize the agent’s reasoning, planning, and execution loop
* Make failures recoverable, inspectable, and resumable

### Deliverables

* Finalized domain entities:

  * `TestRun`
  * `Goal`
  * `Plan`
  * `AgentAction`
  * `ExecutionState`
* Deterministic workflow state machine
* Explicit retry and fallback policies

### Success Criteria

* A test run can be paused, resumed, or replayed at any step
* State is persisted across crashes or restarts

---

## 1.2 Web Automation Excellence

### Objectives

* Best-in-class autonomous web testing

### Features

* DOM + visual hybrid perception
* Self-healing selectors using LLM reasoning
* Multi-tab and multi-window navigation
* Network-aware assertions
* Authentication flow support (SSO, OAuth)

### Sub-Steps

* DOM sensor abstraction (semantic roles, text, structure)
* Visual verification pipeline (layout, visibility, diffs)
* Selector failure → intent re-mapping → recovery

### Success Criteria

* Tests survive moderate DOM and layout changes
* Tests can validate UI, data, and network state

---

## 1.3 Electron App Support

### Objectives

* Treat Electron apps as first-class citizens

### Features

* Playwright attachment to Electron runtime
* App lifecycle awareness (launch, reload, crash)
* Native menu and dialog interaction
* File system assertions (exports, downloads)

### Architecture Strategy: The "Driver-Tool" Pattern
* **Black-Box Testing**: Interact via CDP (`--remote-debugging-port`), effectively treating the app as a specialized browser instance.
* **Unified Driver**: Introduce `IAppDriver` to abstract differences between Web (Puppeteer/Playwright) and Electron (CDP).
* **Dynamic Tooling**: Replace hardcoded actions with a `ToolRegistry` that feeds the LLM.

### Sub-Steps: Implementation
1.  **Core Abstraction**:
    *   Create `IAppDriver` interface (connect, disconnect, getCapabilities).
    *   Create `ToolRegistry` and `ToolDefinition` (schema + executor).
2.  **Driver Implementation**:
    *   Refactor `IBrowserAutomation` into `WebDriver`.
    *   Create `ElectronDriver` using `chromium.connectOverCDP`.
3.  **Prompt Engineering**:
    *   Update `LLMPromptUtils` to build prompts dynamically from `ToolRegistry`.
    *   Update `LangChainAdapter` to use registry-based validation.
4.  **Lifecycle**:
    *   Handle external app launching and attaching via CLI args.

### Success Criteria

* Same natural-language test works for web and Electron
* No Electron-specific logic leaks into the core domain

---

## 1.4 Developer Experience & Adoption

### Objectives

* Make Domia easy to adopt and trust

### Features

* CLI-first workflow
* CI/CD templates (GitHub Actions, GitLab, etc.)
* Rich test reports (steps, screenshots, reasoning)

### Success Criteria

* A new user can run their first test in <10 minutes
* Clear failure explanations without reading logs

---

# Phase 2 — Mobile Expansion (Premium Capability)

**Goal**: Extend Domia to mobile apps without compromising core abstractions.

---

## 2.1 Cross-Platform UI Abstraction Layer

### Objectives

* Unify interaction concepts across platforms

### Core Abstractions

* `Tap`
* `Type`
* `Scroll`
* `WaitFor`
* `AssertVisible`

### Success Criteria

* Planner produces platform-agnostic action plans
* Execution is delegated to platform adapters

---

## 2.2 Mobile Automation Integration

### Objectives

* Enable autonomous testing for iOS and Android apps

### Tooling

* Appium / Maestro / Detox (pluggable)
* Accessibility tree as primary signal
* OCR and vision as fallback

### Features

* Screen-based assertions
* Gesture planning (swipe, long-press)
* App background/foreground handling

### Success Criteria

* Domia can execute onboarding and login flows
* Tests survive minor UI rearrangements

---

## 2.3 Mobile-Specific Self-Healing

### Objectives

* Compensate for non-deterministic mobile UIs

### Features

* Screen intent matching
* Accessibility ID inference
* Dynamic wait and retry strategies

### Success Criteria

* Reduced flaky failures compared to script-based tools

---

# Phase 3 — Desktop Apps (Selective & Enterprise)

**Goal**: Provide AI-assisted validation for critical desktop workflows.

> ⚠️ Desktop support is intentionally limited in scope.

---

## 3.1 Accessibility-First Desktop Support

### Objectives

* Support desktop apps with strong accessibility APIs

### Platforms

* Windows (UI Automation)
* macOS (AX APIs)
* Linux (AT-SPI)

### Features

* UI tree inspection
* Role- and label-based interaction

### Success Criteria

* Reliable smoke tests for accessibility-compliant apps

---

## 3.2 Visual + OCR Fallback Mode

### Objectives

* Enable minimal support for inaccessible apps

### Features

* Screenshot-based perception
* Vision-based element detection
* LLM layout reasoning

### Constraints

* Explicitly marked as "best-effort"
* Limited to critical flows only

---

# Phase 4 — Platform Maturity & Business Moat

**Goal**: Turn Domia into a defensible, enterprise-grade platform.

---

## 4.1 Unified Test Language

### Objectives

* One intent, any platform

### Features

* Platform inference at runtime
* Adaptive plan generation

### Success Criteria

* Same prompt runs on web, Electron, and mobile

---

## 4.2 Explainability & Trust

### Objectives

* Make AI behavior auditable

### Features

* Step-by-step reasoning logs
* Action explanations
* Failure root-cause summaries

---

## 4.3 Execution Modes

### Objectives

* Support diverse deployment needs

### Modes

* Local developer execution
* Cloud runners
* On-prem enterprise runners

---

## 4.4 Commercialization & Tiers

### Suggested Tiers

* **Free**: Web, limited runs
* **Pro**: Web + Electron, CI, self-healing
* **Team**: Mobile support, collaboration
* **Enterprise**: Desktop, on-prem, compliance

---

# Long-Term Vision

Domia is not a testing tool.

It is an **autonomous QA engineer** that:

* Understands intent
* Plans intelligently
* Executes resiliently
* Explains its decisions
* Improves over time

The end state is not fewer tests — it is **no test scripts at all**.
