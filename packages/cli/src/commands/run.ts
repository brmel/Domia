import { bootHeadless, startRun, replayRun, type RunEvent } from '@domia/hosts';
import { EP } from '@domia/contracts';
import type { CaseId, CaseService, RunId, TargetSpec } from '@domia/contracts';
import { parseModelChain, parseUrl, parsePositiveInt } from '../parse.js';

/** Slice-5: the persisted autonomous run — against a case (or an ad-hoc one from --url). */
export async function run(request: string, opts: { case?: string; url?: string; electron?: string; model: string; maxTurns: string; questions?: boolean; approvals?: string }): Promise<number> {
  if (!request.trim()) { console.error('run: request must not be empty'); return 1; }
  const model = parseModelChain(opts.model);
  if (!model.ok) { console.error(model.error); return 1; }
  if (!opts.case && !opts.url && !opts.electron) { console.error('run: pass --case <id>, --url <url>, or --electron <appPath>'); return 1; }

  const boot = await bootHeadless();
  if (boot.isErr()) { console.error(boot.error.message); return 1; }
  const { kernel } = boot.value;

  const svc = kernel.resolve(EP.CaseService);
  if (svc.isErr()) { console.error(svc.error.message); await kernel.shutdown(); return 1; }
  const caseIdR = await resolveCase(svc.value, opts);
  if (!caseIdR.ok) { console.error(caseIdR.error); await kernel.shutdown(); return 1; }

  console.log(`\n▶ run: "${request}"\n  case: ${caseIdR.caseId}  model: ${opts.model}\n`);
  const started = await startRun(kernel, {
    caseId: caseIdR.caseId,
    request,
    model: model.spec,
    maxTurns: parsePositiveInt(opts.maxTurns, 24),
    runOptions: {
      interactive: true,
      ...(opts.questions === false ? { questions: 'never' as const } : {}),
      ...(opts.approvals === 'dangerous' ? { approvals: 'dangerous' as const } : {}),
    },
    onEvent: printEvent,
  });
  await kernel.shutdown();

  if (started.isErr()) { console.error('\n✗ run error:', started.error.message); return 3; }
  const { runId, outcome } = started.value;
  if (outcome.status === 'ok') {
    const r = outcome.value;
    console.log(`\n✓ ${r.summary}`);
    console.log(`  run ${runId} — ${r.stats.turns} turns, ${r.stats.calls} calls, ${r.stats.usage.input + r.stats.usage.output} tokens, ${(r.stats.durationMs / 1000).toFixed(1)}s`);
    return 0;
  }
  console.error(`\n✗ run ${outcome.status}: ${outcome.error.message}  (run ${runId})`);
  return outcome.status === 'cancelled' ? 2 : 1;
}

/** Re-drive a past run from its recorded tape; tools re-execute, decisions don't. */
export async function replay(runId: string): Promise<number> {
  console.log(`\n▶ replay: ${runId}\n`);
  const replayed = await replayRun(runId as RunId, { onEvent: printEvent });
  if (replayed.isErr()) { console.error('\n✗ replay error:', replayed.error.message); return 3; }
  const { runId: newId, outcome } = replayed.value;
  if (outcome.status === 'ok') {
    console.log(`\n✓ ${outcome.value.summary}`);
    console.log(`  replayed as run ${newId} — ${outcome.value.stats.turns} turns, ${outcome.value.stats.calls} calls`);
    return 0;
  }
  console.error(`\n✗ replay ${outcome.status}: ${outcome.error.message}  (run ${newId})`);
  return 1;
}

async function resolveCase(svc: CaseService, opts: { case?: string; url?: string; electron?: string }): Promise<{ ok: true; caseId: CaseId } | { ok: false; error: string }> {
  if (opts.case) return { ok: true, caseId: opts.case as CaseId };
  let target: TargetSpec;
  let name: string;
  if (opts.url) {
    const url = parseUrl(opts.url);
    if (!url.ok) return { ok: false, error: url.error };
    target = { kind: 'web', url: url.url };
    name = `adhoc: ${url.url}`;
  } else if (opts.electron) {
    target = { kind: 'electron', appPath: opts.electron };
    name = `adhoc electron: ${opts.electron}`;
  } else {
    return { ok: false, error: 'pass --case <id>, --url <url>, or --electron <appPath>' };
  }
  const created = await svc.create({ name, target, tags: ['adhoc'] });
  return created.isErr() ? { ok: false, error: created.error.message } : { ok: true, caseId: created.value.id };
}

function printEvent(e: RunEvent): void {
  switch (e.type) {
    case 'turn': console.log(`  [${e.seq}] ${e.turn.kind}: ${e.turn.summary.slice(0, 90)}`); break;
    case 'call': console.log(`      → ${e.call.name} ${e.status === 'ok' ? 'ok' : e.status}`); break;
    case 'plan': console.log(`      ✎ plan r${e.revision}: ${e.diff.summary}`); break;
    case 'waiting_user': console.log(`      ? ${e.kind}: ${e.question}`); break;
    case 'signal': console.log(`      ~ ${e.signal.kind}: ${e.signal.message}`); break;
    default: break;
  }
}
