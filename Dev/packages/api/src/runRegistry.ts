import { EP, resultOk, resultErr, domiaError, moduleId, brandId } from '@domia/contracts';
import type {
  CaseContext, CaseId, HumanReply, LoopRun, ModuleResult, PersonaId, RunId, RunOptions, StartOptions,
} from '@domia/contracts';
import type { Kernel } from '@domia/kernel';

const API = moduleId('api');

interface LiveRun { readonly run: LoopRun; readonly caseCtx: CaseContext }

/**
 * F1 — the one stateful exception. Live control (pause/cancel/answer/watch) needs
 * the actual LoopRun object, not a store row; this holds it while the run is live
 * and evicts on terminal. Store rows remain the truth for dead runs.
 */
export class RunRegistry {
  private readonly live = new Map<RunId, LiveRun>();

  constructor(private readonly kernel: Kernel) {}

  get(id: RunId): LoopRun | undefined { return this.live.get(id)?.run; }

  /** Alloc the run chain, persist the row, and drive it in the background (non-blocking). */
  async start(caseId: CaseId, request: string, opts?: StartOptions, interactive = true): Promise<ModuleResult<RunId>> {
    const caseSvc = this.kernel.resolve(EP.CaseService);
    if (caseSvc.isErr()) return resultErr(caseSvc.error);
    const engine = this.kernel.resolve(EP.LoopEngine);
    if (engine.isErr()) return resultErr(engine.error);
    const store = this.kernel.resolve(EP.Store);
    if (store.isErr()) return resultErr(store.error);

    const caseCtxR = await caseSvc.value.allocContext(caseId);
    if (caseCtxR.isErr()) return resultErr(caseCtxR.error);
    const caseCtx = caseCtxR.value;

    const persona: PersonaId = opts?.persona ?? brandId<'PersonaId'>('lead');
    const options: RunOptions = { ...opts, persona, interactive };
    const runR = await engine.value.alloc({ caseCtx, request, options });
    if (runR.isErr()) { await caseCtx.dispose(); return resultErr(runR.error); }
    const run = runR.value;

    const ins = await store.value.runs.insert({ id: run.runId, caseId, persona: String(persona), status: 'running', request, options, startedAt: new Date().toISOString() });
    if (ins.isErr()) { await run.dispose(); await caseCtx.dispose(); return resultErr(ins.error); }

    this.live.set(run.runId, { run, caseCtx });
    void run.start()
      .then(async (r) => {
        const patch = r.isOk()
          ? { status: r.value.status, ...(r.value.status === 'ok' ? { report: r.value.value } : {}), endedAt: new Date().toISOString() }
          : { status: 'failed' as const, endedAt: new Date().toISOString() };
        await store.value.runs.update(run.runId, patch).catch(() => undefined);
      })
      .finally(async () => { this.live.delete(run.runId); await caseCtx.dispose(); });

    return resultOk(run.runId);
  }

  pause(id: RunId): Promise<ModuleResult<void>> { return this.withLive(id, (r) => r.pause()); }
  resume(id: RunId): Promise<ModuleResult<void>> { return this.withLive(id, (r) => r.resume()); }
  cancel(id: RunId, reason: string): Promise<ModuleResult<void>> { return this.withLive(id, (r) => r.cancel(reason)); }
  answer(id: RunId, reply: HumanReply): Promise<ModuleResult<void>> { return this.withLive(id, (r) => r.answer(reply)); }

  private withLive<T>(id: RunId, fn: (r: LoopRun) => Promise<ModuleResult<T>>): Promise<ModuleResult<T>> {
    const run = this.get(id);
    if (!run) return Promise.resolve(resultErr(domiaError(API, 'RUN_NOT_LIVE', `run '${id}' is not live; resume it to steer, or read its record`)));
    return fn(run);
  }
}
