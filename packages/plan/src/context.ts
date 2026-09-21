import { newId } from '@domia/kernel';
import { resultOk, resultErr, domiaError, moduleId, brandId, outcomeOk, metaSince } from '@domia/contracts';
import type {
  ContextId, ModuleResult, Outcome, Plan, PlanConfig, PlanContext, PlanCtxState,
  PlanId, PlanOp, PlanRevision, RunId, Signal, Store, ToolCall, ToolManifest, ToolOutput, Tracer, Unsubscribe,
} from '@domia/contracts';
import { applyOp } from './ops.js';
import { PLAN_TOOLS, callToOp } from './tools.js';

const PLAN = moduleId('plan');
const DEFAULT_STALE_AFTER_TURNS = 5;

export class PlanContextImpl implements PlanContext {
  readonly id: ContextId = brandId<'ContextId'>(newId(12));
  private plan: Plan;
  private config: PlanConfig = {};
  private turnsSinceChange = 0;
  private readonly subs = new Set<(rev: PlanRevision) => void>();

  constructor(planId: PlanId, runId: RunId, goal: string, private readonly store: Store, private readonly tracer: Tracer) {
    this.plan = { id: planId, runId, goal, items: [], revision: 0, status: 'empty' };
  }

  configure(patch: Partial<PlanConfig>): ModuleResult<void> { this.config = { ...this.config, ...patch }; return resultOk(undefined); }
  inspect(): Readonly<PlanConfig & PlanCtxState> { return { ...this.config, revision: this.plan.revision }; }
  current(): Plan { return this.plan; }

  async apply(op: PlanOp, origin: 'agent' | 'user'): Promise<ModuleResult<PlanRevision>> {
    const { plan, diff } = applyOp(this.plan, op);
    this.plan = plan;
    const rev: PlanRevision = { revision: plan.revision, op, origin, at: new Date().toISOString(), diff };
    // Write-through BEFORE returning so the UI/board is never behind.
    const persisted = await this.persist(rev);
    if (persisted.isErr()) return resultErr(persisted.error);
    this.turnsSinceChange = 0;
    for (const fn of this.subs) fn(rev);
    return resultOk(rev);
  }

  private async persist(rev: PlanRevision): Promise<ModuleResult<void>> {
    const up = await this.store.plans.upsert(
      { id: this.plan.id, runId: this.plan.runId, goal: this.plan.goal, revision: this.plan.revision, status: this.plan.status, updatedAt: rev.at },
      this.plan.items.map((it) => ({ ...it, planId: this.plan.id })),
    );
    if (up.isErr()) return up;
    return this.store.plans.appendRevision({ planId: this.plan.id, revision: rev.revision, op: rev.op, origin: rev.origin, at: rev.at });
  }

  toolManifests(): readonly ToolManifest[] { return PLAN_TOOLS; }

  async dispatch(call: ToolCall): Promise<ModuleResult<Outcome<ToolOutput>>> {
    const started = new Date().toISOString();
    return resultOk(await this.tracer.withSpan('plan.tool', { tool: call.name }, async (span) => {
      const op = callToOp(call);
      const meta = metaSince(started, span.traceId, span.spanId);
      if (op.isErr()) return { status: 'failed', error: op.error, meta, toJSON: () => ({}) } satisfies Outcome<ToolOutput>;
      const rev = await this.apply(op.value, 'agent');
      if (rev.isErr()) return { status: 'failed', error: rev.error, meta, toJSON: () => ({}) } satisfies Outcome<ToolOutput>;
      return outcomeOk<ToolOutput>({ value: { plan: this.plan, diff: rev.value.diff } }, meta);
    }));
  }

  onChange(fn: (rev: PlanRevision) => void): Unsubscribe { this.subs.add(fn); return () => this.subs.delete(fn); }

  /**
   * Advisory only (never a stop): once an active plan hasn't been touched for
   * `staleAfterTurns` polls — the loop polls once per turn — the plan has likely
   * drifted from reality. Firing nudges the agent to revise/complete items.
   */
  staleness(): Signal | null {
    this.turnsSinceChange++;
    const threshold = this.config.staleAfterTurns ?? DEFAULT_STALE_AFTER_TURNS;
    if (this.plan.status !== 'active' || this.turnsSinceChange < threshold) return null;
    const active = this.plan.items.filter((it) => it.status === 'active').map((it) => it.title);
    return { kind: 'plan_stale', message: `Plan unchanged for ${this.turnsSinceChange} turns${active.length ? ` while '${active.join("', '")}' is in progress` : ''}. Revise or complete plan items to reflect what you've actually done.` };
  }

  async dispose(): Promise<void> { this.subs.clear(); }

  static async make(runId: RunId, goal: string, store: Store, tracer: Tracer): Promise<ModuleResult<PlanContextImpl>> {
    const planId = brandId<'PlanId'>(newId(12));
    const ctx = new PlanContextImpl(planId, runId, goal, store, tracer);
    const seed = await store.plans.upsert({ id: planId, runId, goal, revision: 0, status: 'empty', updatedAt: new Date().toISOString() }, []);
    return seed.isErr() ? resultErr(domiaError(PLAN, 'IO', 'failed to seed plan', { cause: seed.error })) : resultOk(ctx);
  }
}
