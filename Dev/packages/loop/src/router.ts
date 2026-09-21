import { newId } from '@domia/kernel';
import { resultErr, domiaError, moduleId, brandId } from '@domia/contracts';
import type {
  CaseId, CancelSignal, LoopRunInternals, LoopRunView, MemoryService, MetaToolHandler, ModuleResult, Outcome, PlanContext, ProposedCall,
  TargetSession, ToolCall, ToolOutput,
} from '@domia/contracts';

const LOOP = moduleId('loop');

/**
 * Stamps our CallId (D5) and dispatches by **ownership**: whoever declares the tool
 * gets the call. Session tools are matched against its live manifest set, so any
 * MCP mount (crawl4ai, github, …) routes with no router change.
 */
export class ToolRouter {
  private readonly metaByName = new Map<string, MetaToolHandler>();

  constructor(
    private readonly session: TargetSession,
    private readonly plan: PlanContext,
    private readonly memory: { svc: MemoryService; caseId: CaseId },
    metaHandlers: readonly MetaToolHandler[],
    private readonly internals: LoopRunInternals,
    view: LoopRunView,
  ) {
    for (const h of metaHandlers) for (const m of h.manifests(view)) this.metaByName.set(m.name, h);
  }

  stamp(pc: ProposedCall): ToolCall {
    return { callId: brandId<'CallId'>(newId(10)), name: pc.name, args: pc.args };
  }

  async route(call: ToolCall, signal?: CancelSignal): Promise<ModuleResult<Outcome<ToolOutput>>> {
    if (call.name.startsWith('plan.')) return this.plan.dispatch(call);
    if (call.name.startsWith('memory.')) return this.memory.svc.dispatch(this.memory.caseId, call);
    const handler = this.metaByName.get(call.name);
    if (handler) return handler.dispatch(call, this.internals);
    // Anything the session declares (target driver + every MCP mount) goes to the session.
    if (this.session.manifests().some((m) => m.name === call.name)) return this.session.invoke(call, signal);
    return resultErr(domiaError(LOOP, 'UNKNOWN_TOOL', `no route for tool '${call.name}'`));
  }
}
