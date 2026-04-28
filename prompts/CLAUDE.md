# prompts/ — Agent Prompts as Markdown

## Rules
- These are **content**, not code. PMs and non-engineers can edit them.
- Loaded at runtime by `infrastructure/prompts/promptDefaults.ts` → `loadDefaultPrompts()`.
- Variables use `{{name}}` syntax. Substitution happens in `infrastructure/prompts/interpolate.ts`.

## Layout
- `system-instruction.md` — the agent system prompt.
- `step-goal.md` — per-step goal template.
- `targeting/{both,ref-only,mouse-only}.md` — element targeting guidance.
- `shell/{capability-note,available-rule,unavailable-rule}.md` — shell tool guidance.

## Variables in use

**Build-time (`{{name}}` — substituted before the prompt is handed to ADK):**
- `{{toolNames}}` — comma-separated tool list.
- `{{shellSection}}`, `{{shellExecRule}}`, `{{targetingSection}}` — composed at runtime from the relevant sub-prompts.
- `{{stepGoal}}`, `{{viewportWidth}}`, `{{viewportHeight}}`, `{{url}}`, `{{maxActions}}` — per-step values.

**Live-state (`{state.name}` — re-substituted at every model turn from `Session.state`):**
- `{state.currentUrl}` — last URL the agent observed (written by `RunMetricsPlugin`).
- `{state.lastTool}` — most recent tool name called (written by `RunMetricsPlugin`).
- Add new state vars by writing them via `toolContext.state.set(...)` in a plugin or callback.

## Adding a new prompt
1. Add the `.md` file in the right sub-folder.
2. Add the `PromptKey` literal to `domain/ports/IPromptService.ts`.
3. Add the file mapping in `infrastructure/prompts/promptDefaults.ts`'s `PROMPT_FILES`.
4. Add a label in `frontend/features/runs/components/PromptEditor.tsx` if it should be user-editable.

## Editing prompts
- Just edit the `.md` file. No compile, no type-check. Restart the running app to pick up the change.
- Save your changes through the UI's `PromptEditor` to override per-environment without touching the file.
