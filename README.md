# Auto-QA

Autonomous Web Testing Agent powered by LLMs.

## Description

Auto-QA is an Electron desktop application that uses AI to autonomously test web applications. Simply provide a URL and describe your test goal in natural language, and the agent will navigate, interact, and verify the website behavior.

## Features

- 🤖 **AI-Powered Testing** - Uses Claude or GPT to understand and execute test scenarios
- 🌐 **Browser Automation** - Playwright-based headless/headed browser control
- 📸 **Live Screenshots** - Real-time visual feedback during test execution
- ⚡ **Streaming Events** - AsyncGenerator pattern for live UI updates
- 🛑 **Cooperative Cancellation** - Gracefully stop tests at any point
- 🏗️ **Clean Architecture** - Domain-driven design with dependency injection

## Tech Stack

| Layer | Technology |
|-------|------------|
| Domain | TypeScript, neverthrow |
| Application | tsyringe DI, AsyncGenerator |
| Infrastructure | Playwright, Vercel AI SDK, SQLite |
| Presentation | React, Zustand, Electron |

## Quick Start

```bash
# Install dependencies
npm install

# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Run in development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## Project Structure

```
src/
├── domain/           # Pure business logic
│   ├── entities/     # TestRun, TestStep
│   ├── value-objects/# Url, TestRunId, AgentAction
│   ├── ports/        # IBrowserAutomation, ILLMProvider
│   └── errors/       # Typed error classes
├── application/      # Use cases
│   └── use-cases/    # RunTestUseCase
├── infrastructure/   # Adapters
│   ├── adapters/     # Playwright, LLM, Storage, I/O
│   └── di/           # Container configuration
├── presentation/     # UI
│   ├── components/   # React components
│   └── stores/       # Zustand state
└── composition-root.ts  # DI entry point
```

## Architecture

The application follows Clean Architecture principles:

- **Domain Layer** - No external dependencies, pure business logic
- **Application Layer** - Orchestrates use cases with streaming events
- **Infrastructure Layer** - Implements ports with concrete adapters
- **Presentation Layer** - React UI consuming events via IPC

## License

MIT
