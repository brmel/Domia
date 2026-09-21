import type { ZodTypeAny } from 'zod';
import type { ModuleResult } from './errors.js';
import type { ArtifactRef, Outcome } from './outcome.js';
import type { CallId } from './ids.js';
import type { CancelSignal, Context } from './context.js';
import type { McpMount, TargetSpec, ToolPolicy } from './case.js';

export type ToolName = string;
export type Capability = 'dom' | 'native-input' | 'shell' | 'vision' | 'fs' | 'net' | 'meta';

export interface ToolManifest {
  readonly name: ToolName;
  /** Written for the LLM. */
  readonly description: string;
  readonly parameters: ZodTypeAny;
  readonly output: ZodTypeAny;
  readonly capabilities: readonly Capability[];
  /** Informs approvals policy — never a veto. */
  readonly risk: 'safe' | 'guarded' | 'dangerous';
  readonly parallelSafe?: boolean;
  readonly longRunning?: boolean;
}

/** D5 — what the agent emits: no ids, the loop stamps them. */
export interface ProposedCall {
  readonly name: ToolName;
  readonly args: Record<string, unknown>;
}
export interface ToolCall extends ProposedCall {
  readonly callId: CallId;
  readonly timeoutMs?: number;
}

export interface AriaSnapshot {
  readonly kind: 'aria';
  /** Numbered-ref accessibility tree text (ref=eN), as playwright-mcp emits. */
  readonly text: string;
}
export interface NativeSnapshot {
  readonly kind: 'native';
  readonly text: string;
}

export interface Observation {
  readonly snapshot: AriaSnapshot | NativeSnapshot;
  readonly url?: string;
  readonly title?: string;
  readonly screenshot?: ArtifactRef;
  readonly changedSinceLast: boolean;
}

/** D6 — tools that change the page return the fresh observation with the result. */
export interface ToolOutput {
  readonly value: unknown;
  readonly observation?: Observation;
}

export interface ObserveOptions { readonly screenshot?: boolean }
export interface HumanHandback { readonly note?: string }

export interface SessionOptions {
  readonly headed?: boolean;
  readonly interactive?: boolean;
  /**
   * Which target driver scrapes/drives a web target — provider id (e.g.
   * 'playwright-mcp', 'fetch-scrape', 'firecrawl', 'crawl4ai'). Wins over config.
   * Unset → ScopedConfig `tools.driver.<kind>` → first registered driver.
   */
  readonly driver?: string;
  readonly mcpServers?: readonly McpMount[];
  readonly toolPolicy?: ToolPolicy;
  readonly runId?: string;
  /** Sandbox root for shell/files providers — the case's workdir. */
  readonly workdir?: string;
  /** Devtools-grade capture for run provenance: video + Playwright trace. */
  readonly record?: { readonly video?: boolean; readonly trace?: boolean };
  readonly authStateFile?: string;
}

export interface SessionConfig { readonly defaultTimeoutMs?: number }
export interface SessionState {
  readonly target: TargetSpec;
  readonly capabilities: readonly Capability[];
  readonly headed: boolean;
}

export interface TargetSession extends Context<SessionConfig, SessionState> {
  readonly target: TargetSpec;
  /** Target-side toolset after capability ∩ policy gating (loop merges the rest, D7). */
  manifests(): readonly ToolManifest[];
  invoke(call: ToolCall, signal?: CancelSignal): Promise<ModuleResult<Outcome<ToolOutput>>>;
  observe(opts?: ObserveOptions): Promise<ModuleResult<Outcome<Observation>>>;
  /** F7 — flip headed for takeover; reuses auth state. */
  setHeaded(headed: boolean): Promise<ModuleResult<void>>;
  exportAuthState(): Promise<ModuleResult<string>>;
  /** R2 — human drives; resolves when the human confirms done. */
  handoff(reason: string): Promise<ModuleResult<HumanHandback>>;
}

export interface BindingIO {
  readonly saveArtifact: (data: Uint8Array, meta: { kind: ArtifactRef['kind']; mime: string; label?: string }) => Promise<ModuleResult<ArtifactRef>>;
}

export interface ToolBinding {
  /** D18 — live manifests; dynamic providers (MCP) discover these at attach, not statically. */
  manifests(): readonly ToolManifest[];
  execute(call: ToolCall, signal?: CancelSignal): Promise<ModuleResult<ToolOutput>>;
  /** Provider-native observation (e.g. playwright-mcp snapshot). Undefined for tool-only bindings. */
  observe?(opts?: ObserveOptions): Promise<ModuleResult<Observation>>;
  setHeaded?(headed: boolean): Promise<ModuleResult<void>>;
  exportAuthState?(): Promise<ModuleResult<string>>;
  dispose(): Promise<void>;
}

export interface ToolProviderInfo { readonly id: string; readonly scope: 'session' | 'shared' }

/** EP.ToolProvider (many). */
export interface ToolProvider {
  readonly id: string;
  /**
   * 'target' drives the app under test (exactly one per session, chosen by
   * `supports`); 'auxiliary' adds capability to whatever target is running
   * (shell, files, MCP mounts) — all matching auxiliaries attach.
   */
  readonly role: 'target' | 'auxiliary';
  /** D8 — session-scoped attach/dispose with the session; shared = pooled. */
  readonly scope: 'session' | 'shared';
  supports(target: TargetSpec): boolean;
  manifests(target: TargetSpec): readonly ToolManifest[];
  attach(target: TargetSpec, io: BindingIO, opts?: SessionOptions): Promise<ModuleResult<ToolBinding>>;
}

/** EP.ToolService (one). */
export interface ToolService {
  providers(): readonly ToolProviderInfo[];
  catalog(target: TargetSpec): readonly ToolManifest[];
  allocSession(target: TargetSpec, opts?: SessionOptions): Promise<ModuleResult<TargetSession>>;
}
