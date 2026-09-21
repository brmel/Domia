import { resultErr, resultOk, EP, brandId } from '@domia/contracts';
import type { CaseId, ModelSpec, ModuleResult, Outcome, PersonaId, RunEvent, RunId, RunReport, RunOptions } from '@domia/contracts';
import type { Kernel } from '@domia/kernel';

export interface StartRunOptions {
  readonly caseId: CaseId;
  readonly request: string;
  readonly model: ModelSpec;
  readonly persona?: PersonaId;
  readonly runOptions?: RunOptions;
  readonly maxTurns?: number;
  readonly onEvent?: (e: RunEvent) => void;
}

/**
 * Thin orchestrator over the LoopEngine: alloc a case context, alloc the run,
 * persist the run row, drive it to terminal. No execution logic lives here — that
 * is the LoopRun's job (this is the anti-god-object seam).
 */
export async function startRun(kernel: Kernel, opts: StartRunOptions): Promise<ModuleResult<{ runId: RunId; outcome: Outcome<RunReport> }>> {
  const caseSvc = kernel.resolve(EP.CaseService);
  if (caseSvc.isErr()) return resultErr(caseSvc.error);
  const engineR = kernel.resolve(EP.LoopEngine);
  if (engineR.isErr()) return resultErr(engineR.error);
  const storeR = kernel.resolve(EP.Store);
  if (storeR.isErr()) return resultErr(storeR.error);
  const store = storeR.value;

  const caseCtxR = await caseSvc.value.allocContext(opts.caseId);
  if (caseCtxR.isErr()) return resultErr(caseCtxR.error);
  const caseCtx = caseCtxR.value;

  const persona: PersonaId = opts.persona ?? brandId<'PersonaId'>('lead');
  const options: RunOptions = {
    ...opts.runOptions,
    ...(opts.maxTurns !== undefined ? { budgetHints: { ...opts.runOptions?.budgetHints, maxTurns: opts.maxTurns } } : {}),
    persona,
    personaOverrides: { [String(persona)]: { model: opts.model } },
  };

  const runR = await engineR.value.alloc({ caseCtx, request: opts.request, options });
  if (runR.isErr()) { await caseCtx.dispose(); return resultErr(runR.error); }
  const run = runR.value;

  const inserted = await store.runs.insert({ id: run.runId, caseId: opts.caseId, persona, status: 'running', request: opts.request, options, startedAt: new Date().toISOString() });
  if (inserted.isErr()) { await run.dispose(); await caseCtx.dispose(); return resultErr(inserted.error); }

  const pump = opts.onEvent ? (async () => { for await (const e of run.events()) opts.onEvent!(e); })() : Promise.resolve();
  try {
    const outcomeR = await run.start();
    await pump;
    if (outcomeR.isErr()) { await store.runs.update(run.runId, { status: 'failed', endedAt: new Date().toISOString() }); return resultErr(outcomeR.error); }
    const outcome = outcomeR.value;
    await store.runs.update(run.runId, { status: outcome.status, ...(outcome.status === 'ok' ? { report: outcome.value } : {}), endedAt: new Date().toISOString() });
    return resultOk({ runId: run.runId, outcome });
  } finally {
    await caseCtx.dispose();
  }
}
