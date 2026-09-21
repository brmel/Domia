# @domia/tools — Interface Spec

**Purpose.** Everything the agent can *do*. Providers attach to one
**TargetSession** (`MsysAlloc`) exposing two verbs: `invoke` and `observe`.
Default web driver = microsoft/playwright-mcp via `PlaywrightMcpProvider` (E2);
`web` targets can instead be driven by any registered `role:'target'` scraper —
`fetch-scrape` (browserless HTTP→markdown), `firecrawl`, `crawl4ai` — selected by
`SessionOptions.driver` → config `tools.driver.<kind>` → first-match (D26).

**Kind.** K2 factory (`TargetSession`) + K3 providers (`ToolProvider`).

Incorporates D6 (invoke returns observation), D8 (provider scope),
D9 (sequential calls), F3 (locks), F7 (setHeaded), F11 (policy over merged catalog).

---

## Public interfaces (contracts `tools.ts`)

```ts
export interface ToolService {                             // EP.ToolService (one)
  providers(): readonly ToolProviderInfo[];                // sync
  catalog(target: TargetSpec): readonly ToolManifest[];    // sync — what WOULD be offered
  allocSession(target: TargetSpec, opts?: SessionOptions): Promise<ModuleResult<TargetSession>>;
}
export interface SessionOptions {
  readonly headed?: boolean; readonly interactive?: boolean;   // F2 auth capture
  readonly driver?: string;                                    // D26 target-driver id (else config → first-match)
  readonly mcpServers?: readonly McpMount[];                    // from CaseAssets (E1)
  readonly toolPolicy?: ToolPolicy;                            // R6/F11 allow/deny
  readonly authStateFile?: string;                             // F7 — start the session already logged in
}

export interface TargetSession extends Context<SessionConfig, SessionState> {
  readonly target: TargetSpec;
  manifests(): readonly ToolManifest[];                    // sync — post-gating (D7 composes; this is target-side only)
  invoke(call: ToolCall, signal?: CancelSignal): Promise<ModuleResult<Outcome<ToolOutput>>>;
  observe(opts?: ObserveOptions): Promise<ModuleResult<Outcome<Observation>>>;
  setHeaded(headed: boolean): Promise<ModuleResult<void>>; // F7 — flip for takeover, auth + page carried over
  exportAuthState(): Promise<ModuleResult<string>>;        // F7 — the live login, for a case to keep
  handoff(reason: string): Promise<ModuleResult<HumanHandback>>;  // R2 — show the real window to the human
}

export interface ToolProvider {                            // EP.ToolProvider (many)
  readonly id: string;
  readonly scope: 'session' | 'shared';                    // D8
  supports(target: TargetSpec): boolean;
  manifests(target: TargetSpec): readonly ToolManifest[];
  attach(target: TargetSpec, io: BindingIO): Promise<ModuleResult<ToolBinding>>;
}
export interface ToolBinding {
  execute(call: ToolCall, signal?: CancelSignal): Promise<ModuleResult<ToolOutput>>;  // raw; middleware wraps
  setHeaded?(headed: boolean): Promise<ModuleResult<void>>;      // F7 — drivers with a display implement it
  exportAuthState?(): Promise<ModuleResult<string>>;             // F7 — drivers that hold a login implement it
  dispose(): Promise<void>;
}

export interface ToolManifest {
  readonly name: ToolName; readonly description: string;
  readonly parameters: import('zod').ZodTypeAny; readonly output: import('zod').ZodTypeAny;
  readonly capabilities: readonly Capability[];            // 'dom'|'native-input'|'shell'|'vision'|'fs'|'net'
  readonly risk: 'safe' | 'guarded' | 'dangerous';         // informs approvals — never a veto
  readonly parallelSafe?: boolean;                         // D9 (reserved)
  readonly longRunning?: boolean;
}
export interface ToolOutput { readonly value: unknown; readonly observation?: Observation }  // D6
export interface Observation {
  readonly snapshot: AriaSnapshot | NativeSnapshot;        // numbered refs (ref=e12)
  readonly url?: string; readonly title?: string;
  readonly screenshot?: ArtifactRef; readonly changedSinceLast: boolean;
}
```

## Internal classes

| Class | File | Responsibility |
|---|---|---|
| `ToolsModule` / `ToolServiceImpl` | `module.ts` | provider registry, driver selection (D26), capability gating, session alloc |
| `TargetSessionImpl` | `session.ts` | merges provider bindings; `invoke`/`observe`; delegates `setHeaded`/`exportAuthState`/`handoff` to whichever binding has a display |
| **mcp**: `PlaywrightMcpProvider` `PlaywrightBinding` `McpMountProvider` `McpClient` | `providers/mcp/` | E1/E2 — playwright-mcp target driver (`provider.ts` builds the `LaunchPlan`, `binding.ts` owns the replaceable browser process) + case-mounted servers; JSON-Schema→Zod (`schemaMap.ts`); electron CDP launch (`launcher.ts`); devtools capture (`capture.ts`, `diagnostics.ts`, `observe.ts`); harness-side page eval (`pageEval.ts`); packaged-runtime resolution (`runtime.ts`) |
| **fetch**: `FetchScrapeProvider` + `htmlToMarkdown` | `providers/fetch/` | D26 — browserless `role:'target'` web driver; HTTP GET → markdown/text/links; `fetch.get`/`fetch.links`; `native` snapshot observe |
| **scrape**: `McpScrapeProvider` (`firecrawl`/`crawl4ai`) | `providers/scrape/` | D26 — wraps any scraping MCP server as a driver from a `ScrapeServiceSpec` (launch + required env + seed tool); env-based keys → `PROVIDER_AUTH` when selected |
| **shell**: `ShellProvider` + `Sandbox` | `providers/shell/`, `providers/sandbox.ts` | cwd-rooted, output-capped, risk `dangerous` |
| **files**: `FilesProvider` | `providers/files/` | rooted at `caseCtx.workdir`, path-traversal rejected |

**Planned, not yet built** (need macOS AX — see PLAN §8 Senses): `os-a11y`
(macOS AX tree), `vision.locate`, `native-input` (coordinate fallback).
Skill discovery/replay lives in `@domia/skills`,
not here. Middleware/locks/manifest-gate concerns are folded into `module.ts` +
`session.ts` rather than separate files.

## Design notes / problems handled

- **D6 — observation rides tool output.** playwright-mcp returns a snapshot per
  call; `InvokePipeline` folds it into `ToolOutput.observation`. Standalone
  `observe` is for run-start and explicit agent looks only → far fewer snapshots.
- **D8 — scope.** playwright-mcp/capture = `session`; github/postgres MCP =
  `shared` (pooled, ref-counted by `McpServerManager`). Case mounts may override.
- **D9 — sequential.** `invoke` handles one call; the loop's router serializes a
  turn's calls. `parallelSafe` reserved for a later batching pass.
- **F7 — setHeaded (built).** `PlaywrightBinding` keeps the browser process
  replaceable: a flip exports the live storage state to a file, closes the browser
  (collecting its video/trace first), relaunches with `--storage-state` in the other
  display mode, and navigates back to the page the agent was on. Electron targets
  refuse the flip — they already are a real window. `context.handoff` (R2, D31) flips
  headed for the human and back afterwards.
- **Packaged runtime (`runtime.ts`).** playwright-mcp is *spawned*, so it cannot live
  inside an asar archive and cannot assume `node` is on PATH: the desktop app ships it
  under `resources/node_modules` and runs it with Electron's own binary in
  `ELECTRON_RUN_AS_NODE` mode.
- **Capture costs, so it is config (D37).** `tools.record.video` (default off) and
  `tools.record.trace` (default on) set the driver-level default; `SessionOptions.record`
  still wins per session. Video was ~1s of a ~1.7s session alloc and the bulk of a run's
  artifact bytes. `allocSession` is traced as `tool.allocSession`.
- **Policy over merged catalog (F11).** The single gate is the loop's
  `composeToolset` (D7): it merges target ∪ plan ∪ meta and applies persona selector
  ∩ case `toolPolicy` allow/deny globs. `allocSession` also forwards `toolPolicy` to
  providers.

## File manifest

```
tools/
  package.json
  src/
    module.ts   session.ts   index.ts
    providers/sandbox.ts
    providers/mcp/{provider.ts, mountProvider.ts, client.ts, manifests.ts,
                   schemaMap.ts, launcher.ts, capture.ts, diagnostics.ts, observe.ts}
    providers/fetch/{provider.ts, html.ts}
    providers/scrape/mcpScrape.ts
    providers/shell/provider.ts
    providers/files/provider.ts
```
