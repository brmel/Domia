# Domia

**Domia** is an autonomous web testing agent capable of executing complex, multi-step end-to-end (E2E) tests using natural language instructions. It features a durable workflow engine, hierarchical planning, and a self-healing capability driven by LLMs.

## Features

- **Autonomous Navigation**: Navigates, clicks, types, and extracts data from any website.
- **Natural Language Control**: Define tests using plain English (e.g., "Login to the dashboard and check the revenue stats").
- **Visual Perception**: Understands page layout and verifies visual conditions using a custom DOM sensor.
- **Durable Workflows**: Resilient state management that persists test steps and allows for recovery.
- **Hierarchical Planning**: Breaks down complex goals into manageable steps.

## Prerequisites

- **Node.js**: v18 or higher
- **Gemini API Key**: A valid Google Gemini API key.

## Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-org/domia.git
    cd domia
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Set up environment variables:
    Create a `.env` file in the root directory:
    ```properties
    GEMINI_API_KEY=your_api_key_here
    ```

## Usage

### CLI

Run a manual test directly from the command line:

```bash
npm run cli -- run -u <url> -p "<your prompt>"
```

**Example:**
```bash
npm run cli -- run -u https://example.com -p "Click the 'More Information' link and verify the title"
```

### Desktop App

Start the Electron-based desktop application:
```bash
npm run dev
```

## Readiness Gates (CI / Release)

Run readiness validation pipeline (typecheck + architecture + tests) with baseline profile controls:

```bash
npm run readiness:gate -- --profile=staging
```

Production release check:

```bash
npm run release:check
```

Profiles:
- `dev`: readiness gates optional, observe mode by default
- `staging`: readiness gates enabled, observe mode default
- `production`: readiness gates enabled, soft-enforce required

## Verification Contracts

Terminal success behavior is policy-driven (not hardcoded by test type). Configure defaults in `domia.config.json`:

```json
"verification": {
    "enforceSupervisedTerminalPass": true,
    "terminalPassMinConfidence": 0.9,
    "terminalPassMinEvidenceItems": 2
}
```

You can also override these per run via run options (`verification.*`).

## Architecture

Domia is built with a Hexagonal Architecture (Ports & Adapters):

-   **Core Domain**: Contains the business logic, entities (TestRun, Plan, AgentAction), and ports.
-   **Application Layer**: Orchestrates use cases (`RunTestUseCase`), services (`PlannerService`), and workflows.
-   **Infrastructure**: Implements adapters for Browser (Playwright), LLM (LangChain/Google), Persistence (SQLite), and UI.

## Contributing

1.  Fork the repository.
2.  Create a feature branch.
3.  Commit your changes.
4.  Push to the branch.
5.  Open a Pull Request.

## License

[MIT](LICENSE)
