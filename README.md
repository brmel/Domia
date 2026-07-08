# Domia

Domia drives an LLM-powered agent (Google ADK + Gemini) against a real target app — web, Electron, or mobile — to complete a goal from a natural-language prompt. The same backend serves an Electron desktop app and a CLI; runs persist to SQLite.

- 📐 **Architecture**: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — layers, boundaries, subsystems, how-to.
- 🤖 **Working with Claude Code**: [CLAUDE.md](./CLAUDE.md).

## Capabilities
- **Natural-language control** — "Log in and check the revenue stats."
- **Web / Electron / mobile** — one tool catalog over `IAppDriver`; tools gated to each platform's capabilities.
- **Perception** — ARIA/DOM snapshots + screenshots; native accessibility tree on mobile.
- **Durable runs** — steps + checkpoints persisted; suspend/resume across restarts.
- **Optional planning + reflection** — goal decomposition (`DOMIA_PLANNER`) and a goal-satisfaction evaluator (`DOMIA_EVALUATOR`).

## Prerequisites
- Node.js ≥ 18
- A Google Gemini API key

## Setup
```bash
git clone https://github.com/brmel/Domia.git
cd Domia
npm run setup     # deps + Playwright Chromium + .env (Windows: setup\setup.cmd)
# put your key in .env: GOOGLE_API_KEY=your_key_here
npm run doctor    # verify the install
```
Details and per-OS launchers: [setup/README.md](./setup/README.md).

## Usage
```bash
# CLI
npm run cli -- run -u https://example.com -p "Click 'More information' and verify the title"
# Desktop app
npm run dev
# Read-only HTTP (GET /health, /runs, /workflows on :4317)
npm run server
```

## Validation
```bash
npm run typecheck            # tsc --noEmit, 0 errors
npm run check:architecture   # layer-boundary guard
npm run lint
npm run test                 # vitest e2e suite
npm run test:cli             # live LLM-driven CLI scenarios
```
Or `/check` in a Claude Code session.

## Architecture (in one breath)
Hexagonal (ports & adapters): `domain/` (pure core) ← `backend/` (orchestration) ← `infrastructure/` (adapters: Playwright/Appium, ADK, SQLite, reporting); `frontend/` + `apps/` are the renderer and the Electron/CLI/server entry points. See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## License
MIT
