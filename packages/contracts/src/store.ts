import type { ModuleResult } from './errors.js';
import type { ArtifactId, CaseId, PlanId, RunId, ScheduleId, MemoryId } from './ids.js';
import type { OutcomeStatus } from './outcome.js';
import type { Case } from './case.js';
import type { PlanItem, PlanOp } from './plan.js';
import type { RunOptions, RunReport } from './loop.js';
import type { SpanRow, EventRow, AgentExchange } from './trace.js';

export interface Page<T> { readonly rows: readonly T[]; readonly total: number; readonly cursor?: string }

export interface RunRow {
  readonly id: RunId;
  readonly caseId: CaseId;
  readonly parentRunId?: RunId;
  readonly persona: string;
  readonly status: 'running' | 'paused' | 'waiting_user' | 'suspended' | 'interrupted' | OutcomeStatus;
  readonly request: string;
  readonly options: RunOptions;
  readonly report?: RunReport;
  readonly startedAt: string;
  readonly endedAt?: string;
}
export interface RunQuery { readonly caseId?: CaseId; readonly status?: string; readonly cursor?: string; readonly limit?: number }

export interface PlanRow { readonly id: PlanId; readonly runId: RunId; readonly goal: string; readonly revision: number; readonly status: string; readonly updatedAt: string }
export interface PlanItemRow extends PlanItem { readonly planId: PlanId }
export interface PlanRevisionRow { readonly planId: PlanId; readonly revision: number; readonly op: PlanOp; readonly origin: 'agent' | 'user'; readonly at: string }

export interface ExchangeRow extends AgentExchange {}

export interface ArtifactIndexRow {
  readonly id: ArtifactId; readonly runId?: RunId; readonly kind: string; readonly mime: string;
  readonly bytes: number; readonly sha256: string; readonly path: string; readonly label?: string; readonly at: string;
}
export interface SnapshotRow { readonly runId: RunId; readonly provider: string; readonly blobPath: string; readonly at: string }
export interface MemoryRow { readonly id: MemoryId; readonly caseId: CaseId; readonly title: string; readonly tags: readonly string[]; readonly bodyPath: string; readonly createdAt: string; readonly updatedAt: string }
export interface ScheduleRow { readonly id: ScheduleId; readonly caseId: CaseId; readonly cron: string; readonly request: string; readonly options: RunOptions; readonly enabled: boolean; readonly lastRunId?: RunId; readonly nextAt?: string; readonly createdAt: string }

export interface CaseRepo {
  insert(row: Case): Promise<ModuleResult<void>>;
  update(id: CaseId, patch: Partial<Case>): Promise<ModuleResult<void>>;
  get(id: CaseId): Promise<ModuleResult<Case | null>>;
  list(q?: { tag?: string; text?: string; cursor?: string; limit?: number }): Promise<ModuleResult<Page<Case>>>;
  archive(id: CaseId): Promise<ModuleResult<void>>;
}
export interface RunRepo {
  insert(row: RunRow): Promise<ModuleResult<void>>;
  update(id: RunId, patch: Partial<RunRow>): Promise<ModuleResult<void>>;
  get(id: RunId): Promise<ModuleResult<RunRow | null>>;
  list(q?: RunQuery): Promise<ModuleResult<Page<RunRow>>>;
  children(parentRunId: RunId): Promise<ModuleResult<readonly RunRow[]>>;
}
export interface PlanRepo {
  upsert(plan: PlanRow, items: readonly PlanItemRow[]): Promise<ModuleResult<void>>;
  get(runId: RunId): Promise<ModuleResult<{ plan: PlanRow; items: readonly PlanItemRow[] } | null>>;
  appendRevision(rev: PlanRevisionRow): Promise<ModuleResult<void>>;
  history(planId: PlanId): Promise<ModuleResult<readonly PlanRevisionRow[]>>;
}
/** Append-only — replay integrity. */
export interface ExchangeRepo {
  append(row: ExchangeRow): Promise<ModuleResult<void>>;
  listByRun(runId: RunId): Promise<ModuleResult<readonly ExchangeRow[]>>;
}
export interface TraceRepo {
  insertSpan(row: SpanRow): Promise<ModuleResult<void>>;
  insertEvent(row: EventRow): Promise<ModuleResult<void>>;
  spansByRun(runId: RunId): Promise<ModuleResult<readonly SpanRow[]>>;
}
export interface ArtifactIndexRepo {
  index(row: ArtifactIndexRow): Promise<ModuleResult<void>>;
  bySha(sha256: string): Promise<ModuleResult<ArtifactIndexRow | null>>;
  byRun(runId: RunId): Promise<ModuleResult<readonly ArtifactIndexRow[]>>;
  byId(id: ArtifactId): Promise<ModuleResult<ArtifactIndexRow | null>>;
}
export interface SnapshotRepo {
  save(row: SnapshotRow): Promise<ModuleResult<void>>;
  load(runId: RunId): Promise<ModuleResult<SnapshotRow | null>>;
}
export interface SettingsRepo {
  get(key: string): Promise<ModuleResult<unknown>>;
  patch(key: string, value: unknown): Promise<ModuleResult<void>>;
}
export interface ScheduleRepo {
  insert(row: ScheduleRow): Promise<ModuleResult<void>>;
  update(id: ScheduleId, patch: Partial<ScheduleRow>): Promise<ModuleResult<void>>;
  listEnabled(): Promise<ModuleResult<readonly ScheduleRow[]>>;
  remove(id: ScheduleId): Promise<ModuleResult<void>>;
}
export interface MemoryRepo {
  insert(row: MemoryRow): Promise<ModuleResult<void>>;
  update(id: MemoryId, patch: Partial<MemoryRow>): Promise<ModuleResult<void>>;
  byCase(caseId: CaseId): Promise<ModuleResult<readonly MemoryRow[]>>;
  remove(id: MemoryId): Promise<ModuleResult<void>>;
}

/** EP.Store (one). All async — the engine may be swapped. */
export interface Store {
  readonly cases: CaseRepo;
  readonly runs: RunRepo;
  readonly plans: PlanRepo;
  readonly exchanges: ExchangeRepo;
  readonly traces: TraceRepo;
  readonly artifacts: ArtifactIndexRepo;
  readonly snapshots: SnapshotRepo;
  readonly settings: SettingsRepo;
  readonly schedules: ScheduleRepo;
  readonly memories: MemoryRepo;
  migrate(): Promise<ModuleResult<void>>;
  tx<T>(fn: (s: Store) => Promise<ModuleResult<T>>): Promise<ModuleResult<T>>;
}
