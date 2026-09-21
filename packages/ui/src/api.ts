import type {
  AuditRunSummary, AuditView, Case, CaseDraft, CaseId, HumanReply, MemoryCard, MemoryDraft, MemoryId, Page, Plan, PlanRevision,
  ProviderInfo, RunEvent, RunId, RunSummary, RunView, SkillCard, StartOptions, TargetSpec, TimelineEntry, ToolManifest,
} from '@domia/contracts';
import { invoke, watch } from './bridge.js';

export const api = {
  cases: {
    list: () => invoke<Page<Case>>('cases.list'),
    get: (id: CaseId) => invoke<Case>('cases.get', id),
    create: (draft: CaseDraft) => invoke<Case>('cases.create', draft),
    archive: (id: CaseId) => invoke<void>('cases.archive', id),
  },
  runs: {
    list: () => invoke<Page<RunSummary>>('runs.list'),
    get: (id: RunId) => invoke<RunView>('runs.get', id),
    start: (caseId: CaseId, request: string, opts?: StartOptions) => invoke<RunId>('runs.start', caseId, request, opts),
    answer: (id: RunId, reply: HumanReply) => invoke<void>('runs.answer', id, reply),
    cancel: (id: RunId, reason: string) => invoke<void>('runs.cancel', id, reason),
    pause: (id: RunId) => invoke<void>('runs.pause', id),
    resume: (id: RunId) => invoke<void>('runs.resume', id),
    watch: (id: RunId, onEvent: (event: RunEvent) => void) => watch('runs.watch', [id], (e) => onEvent(e as RunEvent)),
  },
  plans: {
    get: (runId: RunId) => invoke<Plan>('plans.get', runId),
    history: (runId: RunId) => invoke<readonly PlanRevision[]>('plans.history', runId),
  },
  traces: {
    timeline: (runId: RunId) => invoke<readonly TimelineEntry[]>('traces.timeline', runId),
  },
  audits: {
    list: () => invoke<readonly AuditRunSummary[]>('audits.list'),
    get: (runId: RunId) => invoke<AuditView>('audits.get', runId),
    sweep: (url: string, opts?: { maxPages?: number }) => invoke<AuditRunSummary>('audits.sweep', url, opts),
  },
  tools: {
    catalog: (target?: TargetSpec) => invoke<readonly ToolManifest[]>('tools.catalog', target),
  },
  agents: {
    providers: () => invoke<readonly ProviderInfo[]>('agents.providers'),
  },
  memories: {
    list: (caseId: CaseId) => invoke<readonly MemoryCard[]>('memories.list', caseId),
    save: (caseId: CaseId, draft: MemoryDraft) => invoke<void>('memories.save', caseId, draft),
    remove: (id: MemoryId) => invoke<void>('memories.remove', id),
  },
  skills: {
    list: () => invoke<readonly SkillCard[]>('skills.list'),
    get: (name: string) => invoke<SkillCard>('skills.get', name),
    relevant: (request: string, limit?: number) => invoke<readonly SkillCard[]>('skills.relevant', request, limit),
  },
  settings: {
    get: () => invoke<Record<string, unknown>>('settings.get'),
    patch: (patch: Record<string, unknown>) => invoke<Record<string, unknown>>('settings.patch', patch),
  },
};
