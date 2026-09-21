import { newId } from '@domia/kernel';
import { resultOk, resultErr, domiaError, moduleId, EP, outcomeOk, metaSince, brandId } from '@domia/contracts';
import type {
  Case, CaseContext, CaseDraft, CaseId, CasePatch, CaseQuery, CaseService, CaseValidation,
  DomiaModule, ModuleHost, ModuleResult, Outcome, AuthCapture, Page, SessionFactory, Store,
} from '@domia/contracts';
import { CaseContextImpl } from './context.js';
import { captureAuthState } from './authCapture.js';

const CASE = moduleId('case');

function draftToCase(id: CaseId, d: CaseDraft): Case {
  return {
    id, name: d.name, target: d.target,
    ...(d.requestTemplate ? { requestTemplate: d.requestTemplate } : {}),
    assets: d.assets ?? {},
    constraints: d.constraints ?? [],
    toolPolicy: d.toolPolicy ?? {},
    tags: d.tags ?? [],
  };
}

class CaseServiceImpl implements CaseService {
  constructor(private readonly store: Store, private readonly workroot: string) {}

  async create(draft: CaseDraft): Promise<ModuleResult<Case>> {
    if (!draft.name.trim()) return resultErr(domiaError(CASE, 'INVALID_ARGS', 'case name required'));
    const c = draftToCase(brandId<'CaseId'>(newId(12)), draft);
    const ins = await this.store.cases.insert(c);
    return ins.isErr() ? resultErr(ins.error) : resultOk(c);
  }
  get(id: CaseId): Promise<ModuleResult<Case | null>> { return this.store.cases.get(id); }
  list(q?: CaseQuery): Promise<ModuleResult<Page<Case>>> {
    return this.store.cases.list(q ? { ...(q.tag ? { tag: q.tag } : {}), ...(q.text ? { text: q.text } : {}), ...(q.limit ? { limit: q.limit } : {}) } : undefined);
  }
  async update(id: CaseId, patch: CasePatch): Promise<ModuleResult<Case>> {
    const upd = await this.store.cases.update(id, patch as Partial<Case>);
    if (upd.isErr()) return resultErr(upd.error);
    const got = await this.store.cases.get(id);
    if (got.isErr()) return resultErr(got.error);
    return got.value ? resultOk(got.value) : resultErr(domiaError(CASE, 'NOT_FOUND', `case '${id}' not found`));
  }
  archive(id: CaseId): Promise<ModuleResult<void>> { return this.store.cases.archive(id); }

  async validate(id: CaseId, sessions: SessionFactory): Promise<ModuleResult<Outcome<CaseValidation>>> {
    const started = new Date().toISOString();
    const got = await this.get(id);
    if (got.isErr()) return resultErr(got.error);
    if (!got.value) return resultErr(domiaError(CASE, 'NOT_FOUND', `case '${id}' not found`));
    const c = got.value;
    const notes: string[] = [];
    let reachable = true;
    const session = await sessions(c.target);
    if (session.isErr()) { reachable = false; notes.push(`unreachable: ${session.error.message}`); }
    else await session.value.dispose();
    const validation: CaseValidation = { reachable, authFresh: c.assets.authState ? 'unknown' : true, secretsResolvable: true, notes };
    return resultOk(outcomeOk(validation, metaSince(started, brandId<'TraceId'>('validate'), brandId<'SpanId'>('validate'))));
  }

  async captureAuth(id: CaseId, sessions: SessionFactory): Promise<ModuleResult<Outcome<AuthCapture>>> {
    const started = new Date().toISOString();
    const got = await this.get(id);
    if (got.isErr() || !got.value) return resultErr(domiaError(CASE, 'NOT_FOUND', `case '${id}' not found`));
    const captured = await captureAuthState(got.value, sessions, this.workroot);
    if (captured.isErr()) return resultErr(captured.error);
    return resultOk(outcomeOk(captured.value, metaSince(started, brandId<'TraceId'>('auth'), brandId<'SpanId'>('auth'))));
  }

  async allocContext(id: CaseId): Promise<ModuleResult<CaseContext>> {
    const got = await this.get(id);
    if (got.isErr()) return resultErr(got.error);
    if (!got.value) return resultErr(domiaError(CASE, 'NOT_FOUND', `case '${id}' not found`));
    return CaseContextImpl.make(got.value, this.workroot);
  }
}

export interface CaseModuleOptions { readonly workroot: string }

export function caseModule(opts: CaseModuleOptions): DomiaModule {
  return {
    manifest: { id: CASE, version: '0.0.0', provides: [EP.CaseService], requires: [moduleId('store')] },
    async init(host: ModuleHost): Promise<ModuleResult<void>> {
      const store = host.resolve(EP.Store);
      if (store.isErr()) return resultErr(store.error);
      const reg = host.register(EP.CaseService, new CaseServiceImpl(store.value, opts.workroot));
      if (reg.isErr()) return reg;
      host.logger.info('case ready');
      return resultOk(undefined);
    },
    async dispose(): Promise<void> {},
  };
}
