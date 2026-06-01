# prompts/ — Agent Prompts as Markdown

These are **content, not code** — editable by non-engineers. Loaded at runtime by `infrastructure/prompts/promptDefaults.ts` (`loadDefaultPrompts`); served + overridden by `PromptService`.

## Layout
- `system-instruction.md` — agent system prompt.
- `step-goal.md` — per-step goal template.
- `targeting/{both,ref-only,mouse-only}.md` — element-targeting guidance (selected by available tools).
- `shell/{capability-note,available-rule,unavailable-rule}.md` — shell-tool guidance.
- `evaluate-goal.md`, `plan-decomposition.md` — evaluator/planner prompts (used when `DOMIA_EVALUATOR`/`DOMIA_PLANNER` are on).

## Variables
- **Build-time `{{name}}`** — substituted once via `shared/reliability/interpolate.ts` before the prompt reaches ADK: `{{toolNames}}`, `{{targetingSection}}`, `{{shellSection}}`, `{{shellExecRule}}`, and the step-goal values (`{{stepGoal}}`, `{{viewportWidth}}`, `{{viewportHeight}}`, `{{url}}`, `{{maxActions}}`). Caller-controlled values are ADK-brace-escaped (`escapeAdkState`) so stray `{state.x}` in untrusted text can't be interpolated.
- **Live-state `{state.name}`** — re-substituted every model turn by `buildInstructionProvider` from `Session.state`: `{state.currentUrl}`, `{state.lastTool}` (written by `RunMetricsPlugin`). Add more via `toolContext.state.set(...)`.

## Adding a prompt
1. Add the `.md` file.
2. Add the `PromptKey` literal in `domain/ports/agent/IPromptService.ts` (+ its `PromptVariables` entry).
3. Add the file mapping in `promptDefaults.ts` `PROMPT_FILES`.
4. If user-editable, surface it in `frontend/features/runs/components/.../PromptEditor`.

## Editing
Edit the `.md` directly. Set `DOMIA_PROMPT_HOT_RELOAD` to pick up changes without a restart; otherwise defaults are cached at startup. UI `PromptEditor` overrides persist per-environment without touching the file.
