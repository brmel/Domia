import { EP, moduleId, domiaError, resultOk, resultErr, brandId, AUDIT_REPORT_LABEL, AUDIT_SNAPSHOT_LABEL, type ApiResult } from '@domia/contracts';
import type {
  ArtifactId, ArtifactStreamRef, Case, CaseDraft, CaseId, CasePatch, CaseQuery, CaseValidation, DomiaApi,
  DomiaError, ExtensionPoint, HumanReply, MemoryCard, MemoryDraft, MemoryId, ModelInfo, ModuleResult, Outcome,
  Page, Plan, PlanRevision, ProviderInfo, RunEvent, RunId, RunQueryApi, RunSummary, RunView, SessionFactory,
  SkillCard, StartOptions, TargetSpec, TimelineEntry, ToolManifest, AuditRunSummary, AuditView, AuditScore,
} from '@domia/contracts';
import type { Kernel } from '@domia/kernel';
import { RunRegistry } from './runRegistry.js';
import { watchRun, watchPlan } from './watch.js';
import { timeline as timelineOf } from './readModels.js';
import { apiOk, apiErr, fromResult, fromOutcome, mapResult } from './unwrap.js';

const API = moduleId('api');
const DEFAULT_TARGET: TargetSpec = { kind: 'web', url: 'about:blank' };
const SETTINGS_KEY = 'app';

/** The one facade UI/CLI/domia-mcp consume. No business logic — every method delegates. */
export class DomiaApiImpl implements DomiaApi {
  private readonly registry: RunRegistry;

  constructor(private readonly kernel: Kernel, private readonly interactive = true) {
    this.registry = new RunRegistry(kernel);
  }

  /** D11 — the SessionFactory case needs, resolved from EP.ToolService (case never imports tools). */
  private sessionFactory(): SessionFactory {
    return (target, opts) => {
      const tools = this.kernel.resolve(EP.ToolService);
      return tools.isErr() ? Promise.resolve(fromToolErr(tools.error)) : tools.value.allocSession(target, opts);
    };
  }

  readonly cases = {
    create: (d: CaseDraft): Promise<ApiResult<Case>> => this.svc(EP.CaseService, (s) => s.create(d)),
    get: (id: CaseId): Promise<ApiResult<Case>> => this.svc(EP.CaseService, async (s) => notNull(await s.get(id), `case '${id}'`)),
    list: (q?: CaseQuery): Promise<ApiResult<Page<Case>>> => this.svc(EP.CaseService, (s) => s.list(q)),
    update: (id: CaseId, p: CasePatch): Promise<ApiResult<Case>> => this.svc(EP.CaseService, (s) => s.update(id, p)),
    archive: (id: CaseId): Promise<ApiResult<void>> => this.svc(EP.CaseService, (s) => s.archive(id)),
    validate: (id: CaseId): Promise<ApiResult<CaseValidation>> => this.svcOutcome(EP.CaseService, (s) => s.validate(id, this.sessionFactory())),
    captureAuth: (id: CaseId): Promise<ApiResult<{ captured: boolean }>> =>
      this.svcOutcome(EP.CaseService, (s) => s.captureAuth(id, this.sessionFactory())).then((r) => (r.ok ? apiOk({ captured: r.data.captured }) : r)),
  };

  readonly runs = {
    start: (caseId: CaseId, request: string, opts?: StartOptions): Promise<ApiResult<RunId>> =>
      this.registry.start(caseId, request, opts, this.interactive).then(fromResult),
    pause: (id: RunId): Promise<ApiResult<void>> => this.registry.pause(id).then(fromResult),
    resume: (id: RunId): Promise<ApiResult<void>> => this.registry.resume(id).then(fromResult),
    cancel: (id: RunId, reason: string): Promise<ApiResult<void>> => this.registry.cancel(id, reason).then(fromResult),
    answer: (id: RunId, reply: HumanReply): Promise<ApiResult<void>> => this.registry.answer(id, reply).then(fromResult),
    get: (id: RunId): Promise<ApiResult<RunView>> => this.svc(EP.Store, async (s) => {
      const row = await s.runs.get(id);
      if (row.isErr()) return resultErr(row.error);
      if (!row.value) return notFound<RunView>(`run '${id}'`);
      const view: RunView = { runId: id, status: row.value.status, request: row.value.request, ...(row.value.report ? { report: row.value.report } : {}) };
      return okResult(view);
    }),
    list: (q?: RunQueryApi): Promise<ApiResult<Page<RunSummary>>> => this.svc(EP.Store, async (s) => {
      const page = await s.runs.list(q);
      return page.isErr() ? resultErr(page.error) : okResult<Page<RunSummary>>({
        total: page.value.total, ...(page.value.cursor ? { cursor: page.value.cursor } : {}),
        rows: page.value.rows.map((r) => ({ runId: r.id, status: r.status, request: r.request, startedAt: r.startedAt })),
      });
    }),
    watch: (id: RunId, signal?: AbortSignal): AsyncIterable<RunEvent> => watchRun(this.kernel, this.registry, id, signal),
  };

  readonly plans = {
    get: (runId: RunId): Promise<ApiResult<Plan>> => this.svc(EP.PlanService, async (s) => notNull(await s.get(runId), `plan for run '${runId}'`)),
    history: (runId: RunId): Promise<ApiResult<readonly PlanRevision[]>> => this.svc(EP.PlanService, (s) => s.history(runId)),
    watch: (runId: RunId, signal?: AbortSignal): AsyncIterable<PlanRevision> => watchPlan(this.kernel, this.registry, runId, signal),
  };

  readonly traces = {
    timeline: (runId: RunId): Promise<ApiResult<readonly TimelineEntry[]>> => this.svc(EP.Store, (s) => timelineOf(s, runId)),
    artifact: (id: ArtifactId): Promise<ApiResult<ArtifactStreamRef>> => this.svc(EP.Store, async (s) => {
      const row = await s.artifacts.byId(id);
      if (row.isErr()) return resultErr(row.error);
      return row.value ? okResult<ArtifactStreamRef>({ id, mime: row.value.mime, url: `file://${row.value.path}` }) : notFound<ArtifactStreamRef>(`artifact '${id}'`);
    }),
  };

  readonly tools = {
    catalog: (target?: TargetSpec): Promise<ApiResult<readonly ToolManifest[]>> => Promise.resolve(
      mapResult(this.kernel.resolve(EP.ToolService), (t) => t.catalog(target ?? DEFAULT_TARGET)),
    ),
  };

  readonly agents = {
    providers: (): Promise<ApiResult<readonly ProviderInfo[]>> => Promise.resolve(mapResult(this.kernel.resolve(EP.AgentService), (a) => a.providers())),
    models: (providerId: string): Promise<ApiResult<readonly ModelInfo[]>> => this.svc(EP.AgentService, (a) => a.models(providerId)),
  };

  readonly memories = {
    list: (caseId: CaseId): Promise<ApiResult<readonly MemoryCard[]>> => this.svc(EP.MemoryService, (s) => s.relevant(caseId, '')),
    save: (caseId: CaseId, draft: MemoryDraft): Promise<ApiResult<void>> => this.svc(EP.MemoryService, async (s) => {
      const r = await s.dispatch(caseId, { callId: brandId<'CallId'>('api'), name: 'memory.save', args: { title: draft.title, text: draft.body, ...(draft.tags ? { tags: draft.tags } : {}) } });
      return r.isErr() ? resultErr(r.error) : r.value.status === 'ok' ? resultOk(undefined) : resultErr(r.value.error);
    }),
    remove: (id: MemoryId): Promise<ApiResult<void>> => this.svc(EP.Store, (s) => s.memories.remove(id)),
  };

  readonly skills = {
    list: (): Promise<ApiResult<readonly SkillCard[]>> => this.svc(EP.SkillService, (s) => s.list()),
    get: (name: string): Promise<ApiResult<SkillCard>> => this.svc(EP.SkillService, async (s) => notNull(await s.get(name), `skill '${name}'`)),
    relevant: (request: string, limit?: number): Promise<ApiResult<readonly SkillCard[]>> => this.svc(EP.SkillService, (s) => s.relevant(request, limit)),
  };

  readonly audits = {
    sweep: (url: string, opts?: { maxPages?: number }): Promise<ApiResult<AuditRunSummary>> => this.startSweep(url, opts),
    list: (limit = 20): Promise<ApiResult<readonly AuditRunSummary[]>> => this.listAudits(limit),
    get: (runId: RunId): Promise<ApiResult<AuditView>> => this.getAudit(runId),
  };

  readonly settings = {
    get: (): Promise<ApiResult<Record<string, unknown>>> => this.svc(EP.Store, async (s) => {
      const cur = await s.settings.get(SETTINGS_KEY);
      return cur.isErr() ? resultErr(cur.error) : okResult((cur.value as Record<string, unknown>) ?? {});
    }),
    patch: (p: Record<string, unknown>): Promise<ApiResult<Record<string, unknown>>> => this.svc(EP.Store, async (s) => {
      const cur = await s.settings.get(SETTINGS_KEY);
      if (cur.isErr()) return resultErr(cur.error);
      const merged = { ...((cur.value as Record<string, unknown>) ?? {}), ...p };
      const w = await s.settings.patch(SETTINGS_KEY, merged);
      return w.isErr() ? resultErr(w.error) : okResult(merged);
    }),
  };

  /** A sweep is a run with no agent: a case, a run row, the deterministic pass, a report. */
  private async startSweep(url: string, opts?: { maxPages?: number }): Promise<ApiResult<AuditRunSummary>> {
    const audit = this.kernel.resolve(EP.AuditService);
    const store = this.kernel.resolve(EP.Store);
    const cases = this.kernel.resolve(EP.CaseService);
    if (audit.isErr()) return apiErr(audit.error);
    if (store.isErr()) return apiErr(store.error);
    if (cases.isErr()) return apiErr(cases.error);

    const created = await cases.value.create({ name: `sweep ${url}`, target: { kind: 'web', url }, tags: ['audit', 'sweep'] });
    if (created.isErr()) return apiErr(created.error);

    const runId = brandId<'RunId'>(`sweep-${Date.now().toString(36)}`);
    const startedAt = new Date().toISOString();
    const inserted = await store.value.runs.insert({
      id: runId, caseId: created.value.id, persona: brandId<'PersonaId'>('auditor'), status: 'running',
      request: `deterministic sweep of ${url}`, options: {}, startedAt,
    });
    if (inserted.isErr()) return apiErr(inserted.error);

    const swept = await audit.value.sweep(runId, url, opts?.maxPages ? { maxPages: opts.maxPages } : undefined);
    if (swept.isErr()) {
      await store.value.runs.update(runId, { status: 'failed', endedAt: new Date().toISOString() });
      return apiErr(swept.error);
    }
    const report = await audit.value.report(runId, url);
    await store.value.runs.update(runId, { status: 'ok', endedAt: new Date().toISOString() });
    if (report.isErr()) return apiErr(report.error);

    return apiOk(summarise(runId, url, startedAt, 'ok', report.value.score, audit.value.findings(runId).length));
  }

  private async listAudits(limit: number): Promise<ApiResult<readonly AuditRunSummary[]>> {
    const store = this.kernel.resolve(EP.Store);
    const audit = this.kernel.resolve(EP.AuditService);
    if (store.isErr()) return apiErr(store.error);
    if (audit.isErr()) return apiErr(audit.error);

    const runs = await store.value.runs.list({ limit: limit * 3 });
    if (runs.isErr()) return apiErr(runs.error);
    const audits = runs.value.rows.filter((r) => r.persona === 'auditor').slice(0, limit);

    const summaries = await Promise.all(audits.map(async (row) => {
      const loaded = await this.hydrate(row.id);
      const findings = loaded.ok ? loaded.data.findings.length : 0;
      const score = loaded.ok ? loaded.data.score : undefined;
      return summarise(row.id, targetOf(row.request), row.startedAt, row.status, score, findings);
    }));
    return apiOk(summaries);
  }

  private async getAudit(runId: RunId): Promise<ApiResult<AuditView>> {
    return this.hydrate(runId);
  }

  /** Findings live in memory during a run and in a JSON artifact afterwards (D38). */
  private async hydrate(runId: RunId): Promise<ApiResult<AuditView>> {
    const audit = this.kernel.resolve(EP.AuditService);
    const store = this.kernel.resolve(EP.Store);
    if (audit.isErr()) return apiErr(audit.error);
    if (store.isErr()) return apiErr(store.error);

    const known = audit.value.findings(runId);
    const artifacts = await store.value.artifacts.byRun(runId);
    if (artifacts.isErr()) return apiErr(artifacts.error);
    const snapshot = artifacts.value.find((a) => a.label === AUDIT_SNAPSHOT_LABEL);
    const report = artifacts.value.find((a) => a.label === AUDIT_REPORT_LABEL);

    if (known.length === 0 && snapshot) {
      const tracer = this.kernel.resolve(EP.Tracer);
      if (tracer.isOk()) {
        const stream = await tracer.value.openArtifact(snapshot.id);
        if (stream.isOk()) {
          const text = await new Response(stream.value).text();
          const loaded = await audit.value.load(runId, text);
          if (loaded.isErr()) return apiErr(loaded.error);
        }
      }
    }

    const run = await store.value.runs.get(runId);
    const target = run.isOk() && run.value ? targetOf(run.value.request) : '';
    return apiOk({
      runId, target, score: audit.value.score(runId), findings: audit.value.findings(runId),
      ...(report ? { reportArtifact: report.id } : {}),
    });
  }

  /** Resolve a service EP, run the delegate, collapse to ApiResult. */
  private async svc<S, T>(ep: ExtensionPoint<S>, fn: (s: S) => Promise<ModuleResult<T>>): Promise<ApiResult<T>> {
    const r = this.kernel.resolve(ep);
    return r.isErr() ? apiErr(r.error) : fromResult(await fn(r.value));
  }
  private async svcOutcome<S, T>(ep: ExtensionPoint<S>, fn: (s: S) => Promise<ModuleResult<Outcome<T>>>): Promise<ApiResult<T>> {
    const r = this.kernel.resolve(ep);
    return r.isErr() ? apiErr(r.error) : fromOutcome(await fn(r.value));
  }
}

const okResult = <T>(v: T): ModuleResult<T> => resultOk(v);
const notFound = <T>(what: string): ModuleResult<T> => resultErr(domiaError(API, 'NOT_FOUND', `${what} not found`));
const notNull = <T>(r: ModuleResult<T | null>, what: string): ModuleResult<T> => (r.isErr() ? resultErr(r.error) : r.value === null ? notFound<T>(what) : resultOk(r.value));
const fromToolErr = (e: DomiaError): ModuleResult<never> => resultErr(e);

function summarise(runId: RunId, target: string, startedAt: string, status: string, score: AuditScore | undefined, findings: number): AuditRunSummary {
  return {
    runId, target, startedAt, status, findings,
    ...(score?.overall !== undefined ? { overall: score.overall } : {}),
    ...(score?.grade ? { grade: score.grade } : {}),
  };
}

function targetOf(request: string): string {
  return /https?:\/\/\S+/.exec(request)?.[0] ?? request;
}
