# Domia — Agent Brief

This file is loaded by Claude Code at the start of every session. Read it before doing anything substantive.

## Mission

Domia is a desktop + CLI platform that drives an LLM-powered agent against a real target application (web page or Electron app) so it can complete a goal autonomously. The agent uses Google ADK (Gemini), Playwright drives the target, runs persist to SQLite, and the same backend serves both an Electron desktop app and a CLI.

## How this codebase is organized

Six top-level layers:

```
apps/            entry points — desktop (Electron) + cli
frontend/        React renderer — feature-sliced
backend/         application orchestration — bounded contexts
domain/          pure business core — types, ports, entities
infrastructure/  adapters — implements domain ports
shared/          pure types/constants used by all
```

Each layer has its own `CLAUDE.md` with details. Read the one for the area you're touching:
- `domain/CLAUDE.md`
- `backend/CLAUDE.md`
- `infrastructure/CLAUDE.md`
- `frontend/CLAUDE.md`
- `apps/CLAUDE.md`
- `tests/CLAUDE.md`
- `prompts/CLAUDE.md`

For deeper architecture rationale and how-to guides for adding features, see `docs/ARCHITECTURE.md`.

## Coding conventions

1. **No comments unless they explain WHY.** Never restate what the code does. The reader can read code; they can't read your mind.
2. **Typed const over `enum`.** See `domain/value-objects/CheckpointReason.ts` for the canonical pattern.
3. **`Result<T, E>` over throw across layer boundaries.** `neverthrow` is the library. See `.claude/skills/result-discipline.md`.
4. **No `console.log` in source code** outside of CLI commands. Use `ILogger` (pino-backed).
5. **No magic strings or numbers.** Constants in `shared/defaults/`. Vocabularies in `domain/value-objects/` typed const maps. UI strings in component files (we don't have i18n yet).
6. **No mocks.** Tests are e2e against real DB, real browser, real LLM (replay). See `tests/CLAUDE.md`.
7. **Path aliases**: `@domain`, `@backend`, `@infrastructure`, `@frontend`, `@shared`, `@apps`. No `../../../` chains across layer boundaries.

## Boundaries (CI-enforced by `scripts/check-architecture.mjs`)

- `domain/` imports nothing outside domain.
- `backend/` may not import `@infrastructure`, `@frontend`, `@apps` — except `backend/container/` (the composition root).
- `frontend/` may not import `@infrastructure`. No Node builtins (`fs`, `path`, `os`, `node:*`).
- `apps/desktop/ipc/` may not import `@infrastructure` or `@frontend`.
- `shared/defaults/` may not import Node builtins.

If you violate any of these, `npm run check:architecture` will fail.

## What "done" means

Before claiming any task complete, you must run:

```bash
npx tsc --noEmit          # 0 errors
npm run check:architecture # passing
```

Or run `/check` (a saved command — see `.claude/commands/check.md`).

## Where to find current state

`docs/architecture/audit.md` is the authoritative measured state of the codebase (metrics, coupling, god files, dead-code %, and §10 Next/roadmap). Read it before assuming the codebase looks like something it doesn't. History lives in `git log`. Run `/refactor-status` to summarize.

## Common traps to avoid

1. **Don't bring back loop-detection or pass/fail-required prompts.** We deleted the loop guard in Phase 4.1. The agent's terminal tool is `finish` with optional `verdict`. Verdict-less is a legitimate outcome.
2. **Don't introduce new ports for libraries we already abstract.** Playwright is already hidden behind `IStructuredAutomation` + `IAppDriver`. ADK is hidden behind `IAgentRuntime`. Adding a new port for a single new use is premature.
3. **Don't grow `RunUseCase`.** It's an orchestrator over narrow services. New responsibilities = new service in `backend/runs/`, not new code in `RunUseCase`.
4. **Don't put Playwright code outside `infrastructure/playwright/`.** That folder is the unit of replacement.
5. **Don't add tests with mocks.** If you cannot write an e2e test, the architecture has a problem; stop and tell the user.
6. **Don't put prompt content in TypeScript.** Prompts go in `prompts/*.md`.

## Skills

Reference material in `.claude/skills/`:
- `typescript-strict.md` — strict mode + branded types + typed const + Result discipline.
- `playwright.md` — how we use Playwright + where it's allowed.
- `result-discipline.md` — when to throw, when to Result.
- `our-agent-loop.md` — the end-to-end agent run pipeline.

Read the one relevant to your task before making non-trivial changes to that area.

## Slash commands

- `/check` — run the validation gates and report.
- `/refactor-status` — read the tracker and summarize.

## Working style

- Brief is good. Silent is not. State what you're about to do, then do it.
- One concern per file. If a file grows past ~300 lines, consider splitting.
- One concept per name. Renames are cheap; ambiguous names compound.
- Trust the type-checker. If `tsc` is happy, the change is structurally sound. If `check:architecture` is happy, the boundaries are intact.
