# Domia

**Domia** is an autonomous web testing agent capable of executing complex, multi-step end-to-end (E2E) tests using natural language instructions. It features a durable workflow engine, hierarchical planning, and a self-healing capability driven by LLMs.

📐 **Architecture**: see [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for layers, boundaries, and how-to guides.
🤖 **Agent brief**: see [CLAUDE.md](./CLAUDE.md) for working in this codebase with Claude Code.

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
    GOOGLE_API_KEY=your_api_key_here
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

### Server (read-only HTTP)

Expose run/workflow history over HTTP (same backend, shared container):
```bash
npm run server   # GET /health, /runs, /workflows on :4317
```

## Validation

Before claiming a change complete, run the project gates (or the `/check` saved command):

```bash
npm run typecheck            # tsc --noEmit, 0 errors
npm run check:architecture   # layer-boundary guard
npm run lint
npm run test                 # vitest e2e suite
npm run test:cli             # CLI e2e scenarios
```

## Architecture

Domia is built with a Hexagonal Architecture (Ports & Adapters). See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full picture.

-   **Domain** (`domain/`): Business core — entities (Run, Plan, AgentAction), value objects, and ports. No I/O.
-   **Backend** (`backend/`): Application orchestration — use cases (`RunUseCase`), bounded contexts (`runs/`, `workflows/`), and the DI composition root (`container/`).
-   **Infrastructure** (`infrastructure/`): Adapters implementing domain ports — Browser (Playwright), Agent Runtime (Google ADK / Gemini), Persistence (SQLite), reporting.
-   **Frontend** (`frontend/`) + **Apps** (`apps/`): React renderer and the Electron + CLI entry points.

## Contributing

1.  Fork the repository.
2.  Create a feature branch.
3.  Commit your changes.
4.  Push to the branch.
5.  Open a Pull Request.

## License

MIT
