import { readFile } from 'node:fs/promises';
import { resultOk, resultErr } from '@domia/contracts';
import type {
  AgentConfig, AgentContext, ArtifactReader, LoopRunInternals, LoopRunView, ModuleResult, PlanContext, RunId,
  Store, TargetSession,
} from '@domia/contracts';
import { ToolRouter } from './router.js';
import { composeToolset } from './composer.js';
import type { RunDeps } from './deps.js';

/** R1 vision — resolve a screenshot artifact's bytes from the store for the model. */
function artifactReader(store: Store): ArtifactReader {
  return async (ref) => {
    const row = await store.artifacts.byId(ref.id);
    if (row.isErr() || !row.value) return null;
    return readFile(row.value.path).catch(() => null);
  };
}

export interface RunResources {
  readonly plan: PlanContext;
  readonly session: TargetSession;
  readonly agent: AgentContext;
  readonly router: ToolRouter;
  readonly view: LoopRunView;
}

/**
 * Allocate everything a run needs, in dependency order, unwinding cleanly on any
 * failure. Kept apart from the drive loop so "what a run is made of" reads in one
 * place and the loop never deals with construction.
 */
export async function assembleRun(d: RunDeps, runId: RunId, internals: LoopRunInternals): Promise<ModuleResult<RunResources>> {
  const planR = await d.planSvc.allocContext(runId, d.request);
  if (planR.isErr()) return resultErr(planR.error);
  const plan = planR.value;

  const sessionR = await d.toolSvc.allocSession(d.caseCtx.resolvedTarget, {
    toolPolicy: d.caseCtx.toolPolicy,
    runId,
    workdir: d.caseCtx.workdir,
    // A login captured for this case (F7) — the session starts already signed in.
    ...(d.caseCtx.authStatePath ? { authStateFile: d.caseCtx.authStatePath } : {}),
    // Case-mounted MCP servers (crawl4ai, github, …) join this session's toolset (E1).
    ...(d.caseCtx.case.assets.mcpServers?.length ? { mcpServers: d.caseCtx.case.assets.mcpServers } : {}),
  });
  if (sessionR.isErr()) { await plan.dispose(); return resultErr(sessionR.error); }
  const session = sessionR.value;

  const view: LoopRunView = { runId, options: d.options, request: d.request, capabilities: session.inspect().capabilities as readonly string[] };
  const metaManifests = [
    ...d.metaHandlers.flatMap((h) => h.manifests(view)),
    ...d.memorySvc.toolManifests(d.caseCtx.case.id),
  ];
  // D7/F11 — one merge point: target ∪ plan ∪ meta, gated by persona ∩ case policy.
  const tools = composeToolset(d.toolsetSelector, session.manifests(), plan.toolManifests(), metaManifests, d.caseCtx.toolPolicy);

  const config: AgentConfig = { persona: d.persona, model: d.model, systemPrompt: d.systemPrompt, tools, auth: { kind: 'none' }, temperature: 0, readArtifact: artifactReader(d.store) };
  const agentR = await d.agentSvc.alloc(config);
  if (agentR.isErr()) { await session.dispose(); await plan.dispose(); return resultErr(agentR.error); }
  const agent = agentR.value;

  const router = new ToolRouter(session, plan, { svc: d.memorySvc, caseId: d.caseCtx.case.id }, d.metaHandlers, internals, view);
  return resultOk({ plan, session, agent, router, view });
}

export async function disposeResources(r: RunResources): Promise<void> {
  await r.agent.dispose();
  await r.session.dispose();
  await r.plan.dispose();
}
