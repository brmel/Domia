import { bootHeadless, startRun, type Kernel } from '@domia/hosts';
import { EP, brandId } from '@domia/contracts';
import type { AuditScore, AuditService, CaseId, DimensionScore, Finding, RunEvent } from '@domia/contracts';
import { parseModelChain, parseUrl, parsePositiveInt } from '../parse.js';

const AUDIT_REQUEST = 'Audit this website. Start with audit.sweep for the deterministic checks, then use audit.dimensions to see what is still unassessed and spend judgement only there. Record every finding with evidence and a fix, declare coverage per dimension, call audit.report, and finish with the headline numbers.';

export interface AuditOptions {
  readonly model: string;
  readonly maxTurns: string;
  readonly dimensions?: string;
  readonly request?: string;
  readonly sweepOnly?: boolean;
  readonly json?: boolean;
}

export async function audit(target: string, opts: AuditOptions): Promise<number> {
  const url = parseUrl(target);
  if (!url.ok) { console.error(url.error); return 1; }

  const boot = await bootHeadless();
  if (boot.isErr()) { console.error(boot.error.message); return 1; }
  const { kernel } = boot.value;

  const auditSvc = kernel.resolve(EP.AuditService);
  if (auditSvc.isErr()) { console.error(auditSvc.error.message); await kernel.shutdown(); return 1; }

  const code = opts.sweepOnly
    ? await sweepOnly(kernel, auditSvc.value, url.url, opts)
    : await agentAudit(kernel, auditSvc.value, url.url, opts);

  await kernel.shutdown();
  return code;
}

/** No model, no browser: the deterministic pass on its own, which is free to run. */
async function sweepOnly(kernel: Kernel, svc: AuditService, url: string, opts: AuditOptions): Promise<number> {
  const store = kernel.resolve(EP.Store);
  if (store.isErr()) { console.error(store.error.message); return 1; }
  const caseSvc = kernel.resolve(EP.CaseService);
  if (caseSvc.isErr()) { console.error(caseSvc.error.message); return 1; }

  const created = await caseSvc.value.create({ name: `sweep ${url}`, target: { kind: 'web', url }, tags: ['audit', 'sweep'] });
  if (created.isErr()) { console.error(created.error.message); return 1; }

  const runId = brandId<'RunId'>(`sweep-${Date.now().toString(36)}`);
  const inserted = await store.value.runs.insert({
    id: runId, caseId: created.value.id, persona: brandId<'PersonaId'>('auditor'), status: 'running',
    request: `deterministic sweep of ${url}`, options: {}, startedAt: new Date().toISOString(),
  });
  if (inserted.isErr()) { console.error(inserted.error.message); return 1; }

  if (!opts.json) console.log(`\n▶ sweep: ${url}  (deterministic pass — no model)\n`);
  const swept = await svc.sweep(runId, url);
  if (swept.isErr()) { console.error(`✗ sweep failed: ${swept.error.message}`); return 1; }

  const report = await svc.report(runId, url);
  await store.value.runs.update(runId, { status: 'ok', endedAt: new Date().toISOString() });
  if (report.isErr()) { console.error(report.error.message); return 1; }

  if (opts.json) {
    console.log(JSON.stringify({ runId, url, summary: swept.value, score: report.value.score, findings: svc.findings(runId) }, null, 2));
    return 0;
  }

  console.log(`  ${swept.value.probes} requests in ${swept.value.elapsedMs}ms → ${swept.value.recorded} findings\n`);
  printFindings(svc.findings(runId));
  printScore(report.value.score, svc.findings(runId).length);
  console.log(`\n  report artifact: ${report.value.artifact.id}  (run ${runId})`);
  return 0;
}

async function agentAudit(kernel: Kernel, svc: AuditService, url: string, opts: AuditOptions): Promise<number> {
  const model = parseModelChain(opts.model);
  if (!model.ok) { console.error(model.error); return 1; }

  const caseSvc = kernel.resolve(EP.CaseService);
  if (caseSvc.isErr()) { console.error(caseSvc.error.message); return 1; }
  const created = await caseSvc.value.create({ name: `audit ${url}`, target: { kind: 'web', url }, tags: ['audit'] });
  if (created.isErr()) { console.error(created.error.message); return 1; }

  const scope = opts.dimensions ? `\nAudit only these dimensions: ${opts.dimensions}.` : '';
  console.log(`\n▶ audit: ${url}\n  case: ${created.value.id}  model: ${opts.model}\n`);

  const started = await startRun(kernel, {
    caseId: created.value.id as CaseId,
    request: `${opts.request ?? AUDIT_REQUEST}${scope}`,
    model: model.spec,
    persona: brandId<'PersonaId'>('auditor'),
    maxTurns: parsePositiveInt(opts.maxTurns, 40),
    runOptions: { interactive: false, questions: 'never' },
    onEvent: printEvent,
  });

  if (started.isErr()) { console.error('\n✗ audit error:', started.error.message); return 3; }
  const { runId, outcome } = started.value;

  const report = await svc.report(runId, url);
  const findings = svc.findings(runId);
  if (opts.json) {
    console.log(JSON.stringify({ runId, url, score: svc.score(runId), findings }, null, 2));
  } else {
    printFindings(findings);
    printScore(svc.score(runId), findings.length);
    if (report.isOk()) console.log(`\n  report artifact: ${report.value.artifact.id}`);
  }

  if (outcome.status === 'ok') {
    console.log(`\n✓ ${outcome.value.summary}  (run ${runId})`);
    return 0;
  }
  console.error(`\n✗ audit ${outcome.status}: ${outcome.error.message}  (run ${runId})`);
  return outcome.status === 'cancelled' ? 2 : 1;
}

function printEvent(e: RunEvent): void {
  switch (e.type) {
    case 'turn': console.log(`  [${e.seq}] ${e.turn.kind}: ${e.turn.summary.slice(0, 90)}`); break;
    case 'call': console.log(`      → ${e.call.name} ${e.status === 'ok' ? 'ok' : e.status}`); break;
    case 'signal': console.log(`      ~ ${e.signal.kind}: ${e.signal.message}`); break;
    default: break;
  }
}

const SEVERITY_MARK: Record<Finding['severity'], string> = { blocker: '■', serious: '▲', moderate: '●', minor: '·' };

/** One line per check, with how far it reaches — not one line per URL. */
function printFindings(findings: readonly Finding[]): void {
  if (findings.length === 0) { console.log('  no findings recorded\n'); return; }
  const order = ['blocker', 'serious', 'moderate', 'minor'] as const;
  const byCheck = new Map<string, Finding[]>();
  for (const f of findings) byCheck.set(f.check, [...(byCheck.get(f.check) ?? []), f]);

  const grouped = [...byCheck.values()].sort((a, b) => order.indexOf(a[0]!.severity) - order.indexOf(b[0]!.severity));
  for (const group of grouped) {
    const head = group[0]!;
    const affected = group.reduce((n, f) => n + f.reach.affected, 0);
    const sampled = group.reduce((n, f) => n + f.reach.sampled, 0);
    const spread = group.length > 1 || sampled > 1 ? ` (${group.length} template(s), ${affected}/${sampled} pages)` : '';
    console.log(`  ${SEVERITY_MARK[head.severity]} ${head.severity.padEnd(8)} ${head.dimension.padEnd(14)} ${head.title}${spread}`);
    console.log(`    ${head.confidence} · ${head.check} · fix (${head.remediation.effort}): ${head.remediation.summary}`);
  }
  console.log('');
}

function printScore(score: AuditScore, findings: number): void {
  console.log('  dimension                          score  coverage         findings');
  console.log('  ' + '-'.repeat(70));
  for (const d of score.dimensions) console.log(`  ${row(d)}`);
  console.log('  ' + '-'.repeat(70));
  const overall = score.overall !== undefined ? `${score.overall} (${score.grade})` : 'not assessed';
  console.log(`  overall ${overall} across ${score.assessed}/${score.dimensions.length} dimensions · ${findings} findings`);
}

function row(d: DimensionScore): string {
  const title = d.title.padEnd(34).slice(0, 34);
  const score = (d.score !== undefined ? `${d.score} ${d.grade}${d.cappedByBlocker ? '!' : ''}` : '—').padEnd(7);
  const coverage = (d.coverage.executed === 0 ? 'not assessed' : `${d.coverage.executed}/${d.coverage.applicable}`).padEnd(16);
  const counts = `${d.counts.blocker}B ${d.counts.serious}S ${d.counts.moderate}M ${d.counts.minor}m`;
  return `${title} ${score} ${coverage} ${counts}`;
}

