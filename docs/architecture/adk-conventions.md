# ADK Conventions — how Domia maps to Google ADK best practices

> Checked our `@google/adk` usage (tools, registration, prompts, callbacks,
> sessions) against the official ADK guidance. Verdict: **aligned**; the few
> deviations are deliberate and self-consistent. Sources at the bottom.

## Tools

| ADK best practice | Domia | Status |
|---|---|---|
| The function's description/docstring is sent to the LLM — make it comprehensive (purpose, params, returns) | Every `ToolSpec.description` states purpose + `Input: {…}` + `Output: { status, … }`; `PromptService.getToolDescription` can override per-deployment | ✅ |
| Typed params; favor primitives; **minimize parameters** | Zod object schemas, primitive fields, small surfaces (`click{ref}`, `observe{delayMs?,vision?}`) | ✅ |
| Return a `status` key (`success`/`error`/…) | `toolSuccess` → `{ status: 'success', … }`, `toolError` → `{ status: 'error', error }` | ✅ |
| Errors as descriptive messages, not codes | `toolError(message)` carries the human-readable cause | ✅ (key is `error`, not ADK's suggested `error_message` — but every tool's `Output:` description teaches the LLM the exact shape, so it's self-consistent) |
| Clear, descriptive names | `click`, `type`, `observe`, `list_windows`, `wait_for_url` | ✅ |
| `LongRunningFunctionTool` for pause/await ops | `ToolSpec.isLongRunning` → `LongRunningFunctionTool` in `AdkToolFactory` (`finish`/`suspend`) | ✅ |
| Break multi-step work into small focused tools | One action per tool; `observe` is separate from acting (perception model) | ✅ |
| Toolsets / dynamic provisioning / scalability | Tools carry a `category`; `meta.tools` (`list_categories`/`expand_category`) lets the agent discover + expand categories at runtime — ADK's "dynamic provisioning" pattern | ✅ |

## Registration

- `ToolSpec` (one uniform shape) → `buildToolCatalog` (built-in + plugins + skills, platform-filtered) → `AdkToolFactory` binds each to a `FunctionTool`/`LongRunningFunctionTool`. ADK sees plain function tools — the recommended default category.
- Per-platform gating (dependency presence + `platforms` tag) keeps the toolset right-sized per session — fewer tools = better LLM tool selection, which ADK calls out.

## Prompts / instructions

- Instruction text lives in `prompts/*.md` (not TS), loaded by `PromptService`.
- `buildAgentInstruction` assembles the system instruction from the catalog (tool names + targeting/shell sections); `buildInstructionProvider` does ADK's late-bound `InstructionProvider` (interpolates `{state.*}` from `ReadonlyContext` each turn) — the ADK-idiomatic way to inject live session state.
- `temperature: 0` + `functionCallingConfig: AUTO` — deterministic tool-calling.

## Callbacks / plugins (ADK extension points)

- `beforeModelCallback` = `buildCompactionCallback` (history compaction before each LLM call).
- `RunMetricsPlugin` (ADK `BasePlugin`) for per-step metrics → health monitor.
- `PostActionCaptureMiddleware` captures a perception frame after each tool — our equivalent of an after-tool callback.

## Sessions / runtime

- `InMemorySessionService` + `Runner`; one session per `runId`; `snapshotConversation`/`restoreConversation` persist/restore the ADK event log for suspend/resume.
- Pipeline assembly is isolated in `assembleAdkSession.ts`; `AdkAgentRuntime` is just the run loop — ADK is contained to this one folder behind the `IAgentRuntime` port.

## Deliberate deviations
- **Error key `error`, not `error_message`** — kept because every tool description documents the exact output shape to the LLM; renaming would churn all tools + tests for no comprehension gain.
- **Replay LLM** (`ReplayLlm` implementing the ADK LLM seam) for deterministic e2e — not an ADK feature, but it plugs into ADK's model interface cleanly.

## Sources
- [ADK function tools — best practices](https://adk.dev/tools-custom/function-tools/)
- [Agent Development Kit docs](https://google.github.io/adk-docs/)
- [Build powerful AI agents with ADK tools and best practices](https://medium.com/google-cloud/build-powerful-ai-agents-with-google-adk-tools-and-best-practices-adk-blo-bb9af140662f)
- [Developer's guide to building ADK agents with skills](https://developers.googleblog.com/developers-guide-to-building-adk-agents-with-skills/)
