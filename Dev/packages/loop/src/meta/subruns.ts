import { z } from 'zod';
import { resultOk, outcomeOk, outcomeFail, domiaError, moduleId, brandId } from '@domia/contracts';
import type {
  LoopEngine, LoopRunInternals, LoopRunView, MetaToolHandler, ModuleResult, Outcome, PersonaId,
  RunId, RunReport, ToolCall, ToolManifest, ToolOutput,
} from '@domia/contracts';
import type { RunInternals } from '../internals.js';
import { syntheticMeta } from './meta.js';

const LOOP = moduleId('loop');

interface Child {
  readonly parentRunId: RunId;
  readonly persona: PersonaId;
  readonly done: Promise<Outcome<RunReport>>;
}

const SPAWN = 'agent.spawn';
const AWAIT = 'agent.await';

const MANIFESTS: readonly ToolManifest[] = [
  {
    name: SPAWN,
    description: 'Launch a child run to pursue a sub-goal in its own session and lane, in parallel with this one. Returns a childRunId; collect the result later with agent.await. Use for independent work you can delegate.',
    parameters: z.object({ request: z.string(), persona: z.string().optional() }),
    output: z.unknown(),
    capabilities: ['meta'],
    risk: 'safe',
  },
  {
    name: AWAIT,
    description: 'Block until one child run (childRunId) or all children you spawned finish, returning each report. Call after agent.spawn to gather results.',
    parameters: z.object({ childRunId: z.string().optional() }),
    output: z.unknown(),
    capabilities: ['meta'],
    risk: 'safe',
  },
];

const reportView = (id: RunId, o: Outcome<RunReport>) =>
  o.status === 'ok'
    ? { childRunId: id, status: o.status, summary: o.value.summary, verdict: o.value.verdict, value: o.value.value }
    : { childRunId: id, status: o.status, error: o.error.message };

/** agent.spawn / agent.await — child runs as a first-class belt tool (parallel lanes). */
export class SubRunCoordinator implements MetaToolHandler {
  private readonly children = new Map<RunId, Child>();

  constructor(private readonly engine: () => LoopEngine) {}

  manifests(_view: LoopRunView): readonly ToolManifest[] { return MANIFESTS; }

  async dispatch(call: ToolCall, run: LoopRunInternals): Promise<ModuleResult<Outcome<ToolOutput>>> {
    const internals = run as RunInternals;
    if (call.name === SPAWN) return this.spawn(call, internals);
    if (call.name === AWAIT) return this.await(call, internals);
    return resultOk(outcomeFail<ToolOutput>('failed', domiaError(LOOP, 'UNKNOWN_TOOL', `subruns has no '${call.name}'`), syntheticMeta()));
  }

  private async spawn(call: ToolCall, run: RunInternals): Promise<ModuleResult<Outcome<ToolOutput>>> {
    const persona = call.args['persona'] as string | undefined;
    const request = String(call.args['request']);
    const options = { ...run.options, ...(persona ? { persona: brandId<'PersonaId'>(persona) } : {}) };
    const alloc = await this.engine().alloc({ caseCtx: run.caseCtx, request, options, parentRunId: run.runId });
    if (alloc.isErr()) return resultOk(outcomeFail<ToolOutput>('failed', alloc.error, syntheticMeta()));

    const child = alloc.value;
    const personaId = brandId<'PersonaId'>(persona ?? 'lead');
    // Own the child's run-row lifecycle the way the host's startRun does for a
    // top-level run — plan/tape rows FK to it, so it must exist before start().
    const inserted = await run.store.runs.insert({ id: child.runId, caseId: run.caseId, parentRunId: run.runId, persona: personaId, status: 'running', request, options, startedAt: new Date().toISOString() });
    if (inserted.isErr()) { await child.dispose(); return resultOk(outcomeFail<ToolOutput>('failed', inserted.error, syntheticMeta())); }

    const done = child.start().then(async (r) => {
      const outcome = r.isOk() ? r.value : outcomeFail<RunReport>('failed', r.error, syntheticMeta());
      await run.store.runs.update(child.runId, { status: outcome.status, ...(outcome.status === 'ok' ? { report: outcome.value } : {}), endedAt: new Date().toISOString() });
      return outcome;
    });
    this.children.set(child.runId, { parentRunId: run.runId, persona: personaId, done });
    run.emit({ type: 'spawned', runId: run.runId, childRunId: child.runId, persona: personaId });
    return resultOk(outcomeOk<ToolOutput>({ value: { childRunId: child.runId } }, syntheticMeta()));
  }

  private async await(call: ToolCall, run: RunInternals): Promise<ModuleResult<Outcome<ToolOutput>>> {
    const one = call.args['childRunId'] as string | undefined;
    const ids = one
      ? [brandId<'RunId'>(one)].filter((id) => this.children.get(id)?.parentRunId === run.runId)
      : [...this.children].filter(([, c]) => c.parentRunId === run.runId).map(([id]) => id);
    if (!ids.length) return resultOk(outcomeFail<ToolOutput>('failed', domiaError(LOOP, 'NOT_FOUND', one ? `no child '${one}' spawned by this run` : 'no children to await'), syntheticMeta()));

    const results = await Promise.all(ids.map(async (id) => {
      const outcome = await this.children.get(id)!.done;
      this.children.delete(id);
      return reportView(id, outcome);
    }));
    return resultOk(outcomeOk<ToolOutput>({ value: { results } }, syntheticMeta()));
  }
}
