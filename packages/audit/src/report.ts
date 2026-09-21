import type { AuditScore, DimensionScore, Finding, RunId, Severity } from '@domia/contracts';

export interface ReportInput {
  readonly runId: RunId;
  readonly target: string;
  readonly generatedAt: string;
  readonly score: AuditScore;
  readonly findings: readonly Finding[];
}

const SEVERITY_ORDER: readonly Severity[] = ['blocker', 'serious', 'moderate', 'minor'];

function coverageCell(d: DimensionScore): string {
  const { executed, applicable } = d.coverage;
  if (executed === 0) return 'not assessed';
  const pct = applicable > 0 ? Math.round((executed / applicable) * 100) : 100;
  return `${pct}% (${executed}/${applicable})`;
}

function scoreCell(d: DimensionScore): string {
  if (d.score === undefined) return '—';
  return `**${d.score}** ${d.grade}${d.cappedByBlocker ? ' ⚠︎capped' : ''}`;
}

function dimensionTable(score: AuditScore): string {
  const rows = score.dimensions.map((d) => {
    const counts = SEVERITY_ORDER.map((s) => d.counts[s]).join(' / ');
    const split = `${d.split.verified} / ${d.split.probable} / ${d.split.needsHuman}`;
    return `| ${d.title} | ${scoreCell(d)} | ${coverageCell(d)} | ${counts} | ${split} | ${d.penalty} |`;
  });
  return [
    '| Dimension | Score | Coverage | Blocker/Serious/Moderate/Minor | Penalty verified/probable/needs-human | Total |',
    '|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

function findingBlock(f: Finding): string {
  const where = [f.where.url, f.where.ref, f.where.journey ? `journey: ${f.where.journey}` : undefined]
    .filter(Boolean).join(' · ');
  const standards = f.standards.length ? `\n- Standards: ${f.standards.join(', ')}` : '';
  const patch = f.remediation.patch
    ? `\n\n\`\`\`${f.remediation.patch.language}\n${f.remediation.patch.snippet}\n\`\`\``
    : '';
  return [
    `#### ${f.title}`,
    '',
    `- Severity: **${f.severity}** · Confidence: **${f.confidence}** · Source: ${f.source}`,
    `- Where: ${where}`,
    `- Reach: ${f.reach.affected}/${f.reach.sampled} sampled${standards}`,
    `- Evidence: ${f.evidence.join(', ')}`,
    '',
    f.detail,
    '',
    `**Fix (${f.remediation.effort} effort, ${f.remediation.impact} impact).** ${f.remediation.summary}`,
    `Verify: ${f.remediation.verification}${patch}`,
  ].join('\n');
}

function severityRank(f: Finding): number {
  return SEVERITY_ORDER.indexOf(f.severity);
}

export function renderReport(input: ReportInput): string {
  const { score, findings } = input;
  const assessed = score.dimensions.filter((d) => d.score !== undefined);
  const notAssessed = score.dimensions.filter((d) => d.score === undefined).map((d) => d.title);

  const header = [
    `# Audit — ${input.target}`,
    '',
    `Run \`${input.runId}\` · generated ${input.generatedAt}`,
    '',
    score.overall !== undefined
      ? `**Overall ${score.overall} (${score.grade})** across ${assessed.length} assessed dimensions, ${findings.length} findings.`
      : `**No dimension was assessed** — ${findings.length} findings recorded.`,
    '',
    'The per-dimension scores below are the result; the overall number is a weighted roll-up of assessed dimensions only.',
  ].join('\n');

  const sections = score.dimensions
    .filter((d) => findings.some((f) => f.dimension === d.dimension))
    .map((d) => {
      const own = findings.filter((f) => f.dimension === d.dimension).sort((a, b) => severityRank(a) - severityRank(b));
      return [`### ${d.title} — ${scoreCell(d)}`, '', ...own.map(findingBlock)].join('\n\n');
    });

  const gaps = notAssessed.length
    ? ['## Not assessed', '', ...notAssessed.map((t) => `- ${t}`), '',
       'These dimensions carry no score. Absence of a score is not a pass.'].join('\n')
    : '';

  return [header, '', '## Scores by dimension', '', dimensionTable(score), '',
    findings.length ? '## Findings' : '', ...sections, gaps, ''].filter(Boolean).join('\n');
}
