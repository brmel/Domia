import { resultOk, resultErr, moduleId, EP } from '@domia/contracts';
import type { DomiaModule, ModuleHost, ModuleResult, Plan, PlanContext, PlanId, PlanRevision, PlanService, RunId, Store, Tracer } from '@domia/contracts';
import { PlanContextImpl } from './context.js';

const PLAN = moduleId('plan');

class PlanServiceImpl implements PlanService {
  constructor(private readonly store: Store, private readonly tracer: Tracer) {}

  async allocContext(runId: RunId, goal: string): Promise<ModuleResult<PlanContext>> {
    return PlanContextImpl.make(runId, goal, this.store, this.tracer);
  }

  async get(runId: RunId): Promise<ModuleResult<Plan | null>> {
    const r = await this.store.plans.get(runId);
    if (r.isErr()) return resultErr(r.error);
    if (!r.value) return resultOk(null);
    const { plan, items } = r.value;
    return resultOk({ id: plan.id, runId, goal: plan.goal, revision: plan.revision, status: plan.status as Plan['status'], items: items.map((it) => ({ id: it.id, seq: it.seq, title: it.title, intent: it.intent, status: it.status, ...(it.note ? { note: it.note } : {}) })) });
  }

  async history(runId: RunId): Promise<ModuleResult<readonly PlanRevision[]>> {
    const planR = await this.store.plans.get(runId);
    if (planR.isErr()) return resultErr(planR.error);
    if (!planR.value) return resultOk([]);
    const planId = planR.value.plan.id as PlanId;
    const revs = await this.store.plans.history(planId);
    if (revs.isErr()) return resultErr(revs.error);
    return resultOk(revs.value.map((r) => ({ revision: r.revision, op: r.op, origin: r.origin, at: r.at, diff: { changed: [], summary: '' } })));
  }
}

export function planModule(): DomiaModule {
  return {
    manifest: { id: PLAN, version: '0.0.0', provides: [EP.PlanService], requires: [moduleId('trace'), moduleId('store')] },
    async init(host: ModuleHost): Promise<ModuleResult<void>> {
      const store = host.resolve(EP.Store);
      if (store.isErr()) return resultErr(store.error);
      const reg = host.register(EP.PlanService, new PlanServiceImpl(store.value, host.tracer));
      if (reg.isErr()) return reg;
      host.logger.info('plan ready');
      return resultOk(undefined);
    },
    async dispose(): Promise<void> {},
  };
}
