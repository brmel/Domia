import type { ErrorCode } from './errors.js';
import type { AuditScore, Finding } from './audit.js';
import type { CaseId, RunId, ArtifactId, MemoryId } from './ids.js';
import type { Case, CaseDraft, CasePatch, CaseQuery, CaseValidation, TargetSpec } from './case.js';
import type { HumanReply, RunEvent, RunReport, RunOptions } from './loop.js';
import type { Plan, PlanRevision } from './plan.js';
import type { ToolManifest } from './tools.js';
import type { ProviderInfo, ModelInfo } from './agent.js';
import type { TimelineEntry } from './trace.js';
import type { Page } from './store.js';
import type { MemoryCard, MemoryDraft } from './memory.js';
import type { SkillCard } from './skills.js';

/** Wire-safe: plain data, no stacks/secrets. */
export type ApiResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: { readonly code: ErrorCode; readonly message: string } };

export interface StartOptions extends Pick<RunOptions, 'questions' | 'approvals' | 'persona' | 'personaOverrides'> {}
export interface RunView { readonly runId: RunId; readonly status: string; readonly request: string; readonly report?: RunReport }
export interface RunSummary { readonly runId: RunId; readonly status: string; readonly request: string; readonly startedAt: string }
export interface RunQueryApi { readonly caseId?: CaseId; readonly status?: string; readonly cursor?: string; readonly limit?: number }
export interface ArtifactStreamRef { readonly id: ArtifactId; readonly mime: string; readonly url: string }

export interface AuditRunSummary {
  readonly runId: RunId;
  readonly target: string;
  readonly startedAt: string;
  readonly status: string;
  readonly findings: number;
  readonly overall?: number;
  readonly grade?: string;
}

export interface AuditView {
  readonly runId: RunId;
  readonly target: string;
  readonly score: AuditScore;
  readonly findings: readonly Finding[];
  readonly reportArtifact?: ArtifactId;
}

export interface DomiaApi {
  readonly cases: {
    create(d: CaseDraft): Promise<ApiResult<Case>>;
    get(id: CaseId): Promise<ApiResult<Case>>;
    list(q?: CaseQuery): Promise<ApiResult<Page<Case>>>;
    update(id: CaseId, p: CasePatch): Promise<ApiResult<Case>>;
    archive(id: CaseId): Promise<ApiResult<void>>;
    validate(id: CaseId): Promise<ApiResult<CaseValidation>>;
    captureAuth(id: CaseId): Promise<ApiResult<{ captured: boolean }>>;
  };
  readonly runs: {
    start(caseId: CaseId, request: string, opts?: StartOptions): Promise<ApiResult<RunId>>;
    pause(id: RunId): Promise<ApiResult<void>>;
    resume(id: RunId): Promise<ApiResult<void>>;
    cancel(id: RunId, reason: string): Promise<ApiResult<void>>;
    answer(id: RunId, reply: HumanReply): Promise<ApiResult<void>>;
    get(id: RunId): Promise<ApiResult<RunView>>;
    list(q?: RunQueryApi): Promise<ApiResult<Page<RunSummary>>>;
    watch(id: RunId, signal?: AbortSignal): AsyncIterable<RunEvent>;
  };
  readonly plans: {
    get(runId: RunId): Promise<ApiResult<Plan>>;
    history(runId: RunId): Promise<ApiResult<readonly PlanRevision[]>>;
    watch(runId: RunId, signal?: AbortSignal): AsyncIterable<PlanRevision>;
  };
  readonly traces: {
    timeline(runId: RunId): Promise<ApiResult<readonly TimelineEntry[]>>;
    artifact(id: ArtifactId): Promise<ApiResult<ArtifactStreamRef>>;
  };
  readonly audits: {
    /** Deterministic pass; returns the run it recorded into. */
    sweep(url: string, opts?: { readonly maxPages?: number }): Promise<ApiResult<AuditRunSummary>>;
    list(limit?: number): Promise<ApiResult<readonly AuditRunSummary[]>>;
    get(runId: RunId): Promise<ApiResult<AuditView>>;
  };
  readonly tools: { catalog(target?: TargetSpec): Promise<ApiResult<readonly ToolManifest[]>> };
  readonly agents: { providers(): Promise<ApiResult<readonly ProviderInfo[]>>; models(providerId: string): Promise<ApiResult<readonly ModelInfo[]>> };
  readonly memories: {
    list(caseId: CaseId): Promise<ApiResult<readonly MemoryCard[]>>;
    save(caseId: CaseId, draft: MemoryDraft): Promise<ApiResult<void>>;
    remove(id: MemoryId): Promise<ApiResult<void>>;
  };
  readonly skills: {
    list(): Promise<ApiResult<readonly SkillCard[]>>;
    get(name: string): Promise<ApiResult<SkillCard>>;
    relevant(request: string, limit?: number): Promise<ApiResult<readonly SkillCard[]>>;
  };
  readonly settings: { get(): Promise<ApiResult<Record<string, unknown>>>; patch(p: Record<string, unknown>): Promise<ApiResult<Record<string, unknown>>> };
}
