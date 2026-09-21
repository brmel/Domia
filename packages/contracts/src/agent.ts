import type { ModuleResult } from './errors.js';
import type { ArtifactRef, Outcome, TokenUsage } from './outcome.js';
import type { CallId, PersonaId, PromptRef } from './ids.js';
import type { CancelSignal, Context } from './context.js';
import type { Observation, ProposedCall, ToolManifest, ToolOutput } from './tools.js';
import type { Signal } from './signal.js';

/** R1 vision — resolve a captured screenshot's bytes so the model can see pixels. */
export type ArtifactReader = (ref: ArtifactRef) => Promise<Uint8Array | null>;

export interface ProviderInfo { readonly id: string }
export interface ModelInfo { readonly id: string; readonly label?: string }

export type ModelRef = { readonly provider: string; readonly model: string };
/** R7 — chain: next model on auth/quota/5xx/malformed, never on task difficulty. */
export type ModelSpec = ModelRef | { readonly chain: readonly ModelRef[] };

export interface ThinkingConfig { readonly budgetTokens?: number }
export type AuthRef = { readonly kind: 'env'; readonly variable: string } | { readonly kind: 'none' };

export interface AgentConfig {
  readonly persona: PersonaId;
  readonly model: ModelSpec;
  /** Loaded from prompts/*.md — never inline. */
  readonly systemPrompt: string;
  readonly promptRef?: PromptRef;
  readonly tools: readonly ToolManifest[];
  readonly temperature?: number;
  readonly thinking?: ThinkingConfig;
  readonly auth: AuthRef;
  /** When set, screenshots on an observation are shown to a multimodal model (R1). */
  readonly readArtifact?: ArtifactReader;
}

export interface AgentState {
  readonly turnCount: number;
  readonly usage: TokenUsage;
}

export interface ToolResultLine {
  readonly callId: CallId;
  readonly name: string;
  readonly outcome: Outcome<ToolOutput>;
}

export type StepInput =
  | { readonly kind: 'goal'; readonly goal: string; readonly observation?: Observation; readonly memory?: readonly string[] }
  | { readonly kind: 'toolResults'; readonly results: readonly ToolResultLine[]; readonly observation?: Observation; readonly signals?: readonly Signal[] }
  | { readonly kind: 'user'; readonly message: string }
  | { readonly kind: 'informant'; readonly signals: readonly Signal[] };

/** Propose-only (D5): terminal is a turn kind, not a tool. */
export type AgentTurn =
  | { readonly kind: 'act'; readonly calls: readonly ProposedCall[]; readonly thought?: string }
  | { readonly kind: 'ask'; readonly question: string }
  | { readonly kind: 'final'; readonly summary: string; readonly verdict?: 'pass' | 'fail'; readonly value?: unknown };

export type AgentStreamEvent =
  | { readonly kind: 'text'; readonly delta: string }
  | { readonly kind: 'thought'; readonly delta: string };

/** D10 — opaque, provider-tagged; conformance asserts behavioral round-trip. */
export interface ConversationSnapshot {
  readonly provider: string;
  readonly version: string;
  readonly blob: unknown;
}

export interface AgentContext extends Context<AgentConfig, AgentState> {
  step(input: StepInput, signal?: CancelSignal): Promise<ModuleResult<Outcome<AgentTurn>>>;
  stream(): AsyncIterable<AgentStreamEvent>;
  fork(): Promise<ModuleResult<AgentContext>>;
  snapshot(): Promise<ModuleResult<ConversationSnapshot>>;
  restore(s: ConversationSnapshot): Promise<ModuleResult<void>>;
}

/** EP.AgentProvider (many). */
export interface AgentProvider {
  readonly id: string;
  models(): Promise<ModuleResult<readonly ModelInfo[]>>;
  alloc(config: AgentConfig): Promise<ModuleResult<AgentContext>>;
}

/** EP.AgentService (one). */
export interface AgentService {
  providers(): readonly ProviderInfo[];
  models(providerId: string): Promise<ModuleResult<readonly ModelInfo[]>>;
  alloc(config: AgentConfig): Promise<ModuleResult<AgentContext>>;
}
