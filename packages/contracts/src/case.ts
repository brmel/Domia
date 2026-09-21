import type { ModuleResult } from './errors.js';
import type { ArtifactRef, Outcome } from './outcome.js';
import type { CaseId, SecretRef } from './ids.js';
import type { Context } from './context.js';
import type { Page } from './store.js';
import type { SessionOptions, TargetSession } from './tools.js';

export interface Viewport { readonly width: number; readonly height: number }

export type TargetSpec =
  | { readonly kind: 'web'; readonly url: string; readonly viewport?: Viewport }
  | { readonly kind: 'electron'; readonly appPath: string; readonly args?: readonly string[]; readonly attach?: { readonly cdpPort: number } }
  | { readonly kind: 'desktop'; readonly app?: string }
  | { readonly kind: 'shell'; readonly cwd: string };

export interface McpMount {
  readonly name: string;
  readonly transport: 'stdio' | 'http';
  readonly command?: string;
  readonly args?: readonly string[];
  readonly url?: string;
  readonly env?: Readonly<Record<string, SecretRef | string>>;
  /** D8 override; defaults: playwright-mcp 'session', others 'shared'. */
  readonly scope?: 'session' | 'shared';
  readonly risk?: 'safe' | 'guarded' | 'dangerous';
}

/** R6/F11 — glob patterns on tool name, applied to the merged catalog. */
export interface ToolPolicy {
  readonly allow?: readonly string[];
  readonly deny?: readonly string[];
}

export interface Constraint { readonly kind: string; readonly message: string; readonly data?: Record<string, unknown> }

export interface CaseAssets {
  readonly authState?: SecretRef;
  readonly env?: Readonly<Record<string, SecretRef | string>>;
  readonly files?: readonly ArtifactRef[];
  readonly mcpServers?: readonly McpMount[];
}

export interface Case {
  readonly id: CaseId;
  readonly name: string;
  readonly target: TargetSpec;
  readonly requestTemplate?: string;
  readonly assets: CaseAssets;
  readonly constraints: readonly Constraint[];
  readonly toolPolicy: ToolPolicy;
  readonly tags: readonly string[];
}

export interface CaseDraft {
  readonly name: string;
  readonly target: TargetSpec;
  readonly requestTemplate?: string;
  readonly assets?: CaseAssets;
  readonly constraints?: readonly Constraint[];
  readonly toolPolicy?: ToolPolicy;
  readonly tags?: readonly string[];
}
export type CasePatch = Partial<CaseDraft>;
export interface CaseQuery { readonly tag?: string; readonly text?: string; readonly cursor?: string; readonly limit?: number }

export interface CaseValidation {
  readonly reachable: boolean;
  readonly authFresh: boolean | 'unknown';
  readonly secretsResolvable: boolean;
  readonly notes: readonly string[];
}
export interface AuthCapture { readonly captured: boolean; readonly notes: readonly string[] }

/** D11 — case never imports tools; callers inject this factory (resolved from EP.ToolService). */
export type SessionFactory = (target: TargetSpec, opts?: SessionOptions) => Promise<ModuleResult<TargetSession>>;

export interface CaseCtxConfig { readonly envOverrides?: Readonly<Record<string, string>> }
export interface CaseCtxState { readonly caseId: CaseId }

export interface CaseContext extends Context<CaseCtxConfig, CaseCtxState> {
  readonly case: Case;
  readonly resolvedTarget: TargetSpec;
  readonly workdir: string;
  readonly toolPolicy: ToolPolicy;
  readonly authStatePath?: string;
  /** Sync — resolved at alloc; never traced, never logged. */
  secret(ref: SecretRef): ModuleResult<string>;
}

export interface CaseService {
  create(draft: CaseDraft): Promise<ModuleResult<Case>>;
  get(id: CaseId): Promise<ModuleResult<Case | null>>;
  list(q?: CaseQuery): Promise<ModuleResult<Page<Case>>>;
  update(id: CaseId, patch: CasePatch): Promise<ModuleResult<Case>>;
  archive(id: CaseId): Promise<ModuleResult<void>>;
  validate(id: CaseId, sessions: SessionFactory): Promise<ModuleResult<Outcome<CaseValidation>>>;
  captureAuth(id: CaseId, sessions: SessionFactory): Promise<ModuleResult<Outcome<AuthCapture>>>;
  allocContext(id: CaseId): Promise<ModuleResult<CaseContext>>;
}
