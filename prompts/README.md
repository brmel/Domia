# prompts/

Behavior lives here, never in TypeScript (the core rule, DESIGN §4). Two kinds:

- `personas/*.md` — the agent's operating instructions per role. Loaded by
  `PersonaRegistry` via `PromptRef` (`'personas/lead'` → `personas/lead.md`).
  Editing a persona changes behavior with no recompile.
- `skills/<name>/SKILL.md` — Agent Skills open-standard skills (ECOSYSTEM E4):
  frontmatter (name, description) + instructions + optional `recording.json`
  asset for deterministic replay. Offered only when a request matches the
  description (progressive disclosure).

Personas are `{prompt, model, toolset}` — the markdown is the prompt half; model
and toolset come from settings/`Persona` config. The loop composes the actual
toolset (`ToolsetComposer`, D7); the prompt tells the agent *how* to wield it.

Golden constraints every persona inherits (stated once here, referenced by each):
no hardcoded steps — you decide structure via `plan.*`; recover by diagnosis not
blind retry; ask the user only about intent/constraints you cannot infer; a
verdict-less finish is legitimate.
