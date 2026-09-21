import type { Dimension, Effort, FindingDraft, Impact, Severity } from '@domia/contracts';
import type { ProbeResult } from '../probe.js';
import type { FamilyResult, SweepContext } from './types.js';

interface ExpectedFile {
  readonly path: string;
  readonly dimension: Dimension;
  readonly check: string;
  readonly title: string;
  readonly why: string;
  readonly severity: Severity;
  readonly effort: Effort;
  readonly impact: Impact;
  readonly standards?: readonly string[];
  readonly starter?: string;
}

export const EXPECTED_FILES: readonly ExpectedFile[] = [
  {
    path: '/robots.txt', dimension: 'files', check: 'files.robots-txt', title: 'No robots.txt',
    why: 'Crawlers and agents have no crawl policy to read, and no pointer to the sitemap.',
    severity: 'moderate', effort: 'S', impact: 'medium', standards: ['RFC 9309'],
    starter: 'User-agent: *\nAllow: /\n\nSitemap: {origin}/sitemap.xml\n',
  },
  {
    path: '/sitemap.xml', dimension: 'seo', check: 'seo.sitemap', title: 'No sitemap.xml',
    why: 'Search engines must discover every page by crawling links, which under-indexes deep pages.',
    severity: 'moderate', effort: 'S', impact: 'medium',
    starter: '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>{origin}/</loc></url>\n</urlset>\n',
  },
  {
    path: '/llms.txt', dimension: 'agentic', check: 'agentic.llms-txt', title: 'No /llms.txt',
    why: 'AI agents have no machine-readable index of the site, so they crawl blindly or skip it.',
    severity: 'moderate', effort: 'S', impact: 'medium', standards: ['llms.txt'],
    starter: '# {origin}\n\n> One-paragraph description of what this site offers.\n\n## Docs\n- [Overview]({origin}/): what the product does\n',
  },
  {
    path: '/ai.txt', dimension: 'agentic', check: 'agentic.ai-txt', title: 'No /ai.txt',
    why: 'No declared policy for AI training and ingestion of this content.',
    severity: 'minor', effort: 'S', impact: 'low',
    starter: 'User-agent: *\nDisallow-AI-Training: /\n',
  },
  {
    path: '/.well-known/security.txt', dimension: 'security', check: 'security.security-txt', title: 'No security.txt',
    why: 'A researcher who finds a vulnerability has no documented way to report it.',
    severity: 'minor', effort: 'S', impact: 'medium', standards: ['RFC 9116'],
    starter: 'Contact: mailto:security@example.com\nExpires: 2027-01-01T00:00:00.000Z\n',
  },
  {
    path: '/.well-known/agent-card.json', dimension: 'agentic', check: 'agentic.agent-card', title: 'No agent card',
    why: 'Agents cannot discover what this site offers them or how to authenticate.',
    severity: 'minor', effort: 'M', impact: 'low',
  },
  {
    path: '/.well-known/api-catalog', dimension: 'agentic', check: 'agentic.api-catalog', title: 'No API catalog',
    why: 'No machine-readable index of the APIs this origin exposes.',
    severity: 'minor', effort: 'M', impact: 'low', standards: ['RFC 9727'],
  },
  {
    path: '/.well-known/change-password', dimension: 'files', check: 'files.change-password', title: 'No change-password URL',
    why: 'Password managers cannot deep-link users to the password change form.',
    severity: 'minor', effort: 'S', impact: 'low',
  },
  {
    path: '/manifest.webmanifest', dimension: 'files', check: 'files.manifest', title: 'No web app manifest',
    why: 'No installable metadata: name, icons, theme colour, display mode.',
    severity: 'minor', effort: 'S', impact: 'low',
  },
];

function missing(p: ProbeResult | undefined): boolean {
  return !p || !p.ok;
}

function observedFor(p: ProbeResult | undefined): string {
  if (!p) return 'not probed';
  if (p.error) return `${p.url} — request failed: ${p.error}`;
  return `${p.url} — HTTP ${p.status} ${p.headers['content-type'] ?? ''}`.trim();
}

function fileFinding(spec: ExpectedFile, ctx: SweepContext, probe: ProbeResult | undefined): FindingDraft {
  const starter = spec.starter?.replaceAll('{origin}', ctx.origin);
  return {
    dimension: spec.dimension,
    check: spec.check,
    title: spec.title,
    detail: spec.why,
    severity: spec.severity,
    confidence: 'verified',
    source: 'fetch',
    ...(spec.standards ? { standards: spec.standards } : {}),
    where: { url: `${ctx.origin}${spec.path}` },
    remediation: {
      summary: `Publish ${spec.path}.`,
      effort: spec.effort,
      impact: spec.impact,
      verification: `curl -sI ${ctx.origin}${spec.path} returns 200`,
      ...(starter ? { patch: { language: spec.path.endsWith('.json') ? 'json' : 'text', snippet: starter, file: spec.path.slice(1) } } : {}),
    },
    observed: observedFor(probe),
  };
}

function robotsPolicyFindings(ctx: SweepContext, robots: ProbeResult): readonly FindingDraft[] {
  const body = robots.body;
  const out: FindingDraft[] = [];

  if (!/sitemap:/i.test(body)) {
    out.push({
      dimension: 'seo', check: 'seo.robots-sitemap', title: 'robots.txt does not point at a sitemap',
      detail: 'Crawlers find the sitemap fastest through robots.txt; without the line they rely on guessing /sitemap.xml.',
      severity: 'minor', confidence: 'verified', source: 'fetch',
      where: { url: `${ctx.origin}/robots.txt` },
      remediation: {
        summary: 'Add a Sitemap: line to robots.txt.', effort: 'S', impact: 'low',
        verification: 'robots.txt contains a Sitemap: line resolving to 200',
        patch: { language: 'text', snippet: `Sitemap: ${ctx.origin}/sitemap.xml`, file: 'robots.txt' },
      },
      observed: body.slice(0, 400),
    });
  }

  if (!/content-signal|GPTBot|ClaudeBot|Google-Extended|CCBot|PerplexityBot/i.test(body)) {
    out.push({
      dimension: 'agentic', check: 'agentic.ai-policy', title: 'robots.txt declares no AI policy',
      detail: 'The site takes no position on AI crawlers or training use, so every engine applies its own default.',
      severity: 'moderate', confidence: 'verified', source: 'fetch',
      where: { url: `${ctx.origin}/robots.txt` },
      remediation: {
        summary: 'Declare an explicit position for AI crawlers (Content-Signal, or per-bot rules).',
        effort: 'S', impact: 'medium',
        verification: 'robots.txt names the AI user-agents you allow or refuse',
        patch: { language: 'text', snippet: 'Content-Signal: ai-train=no, search=yes\n\nUser-agent: GPTBot\nAllow: /\n', file: 'robots.txt' },
      },
      observed: body.slice(0, 400),
    });
  }
  return out;
}

/** T0 — the files that should exist, and what robots.txt says once it does. */
export function fileChecks(ctx: SweepContext): FamilyResult {
  const findings: FindingDraft[] = [];
  for (const spec of EXPECTED_FILES) {
    const probe = ctx.files.get(spec.path);
    if (missing(probe)) findings.push(fileFinding(spec, ctx, probe));
  }

  const robots = ctx.files.get('/robots.txt');
  if (robots?.ok) findings.push(...robotsPolicyFindings(ctx, robots));

  const perDimension = (d: Dimension): number => EXPECTED_FILES.filter((f) => f.dimension === d).length;
  return {
    findings,
    coverage: [
      { dimension: 'files', executed: perDimension('files'), applicable: perDimension('files'), notes: 'file presence only; content linting is a later slice' },
      { dimension: 'agentic', executed: perDimension('agentic') + (robots?.ok ? 1 : 0), applicable: perDimension('agentic') + 1, notes: 'discovery files and robots AI policy; agent task completion not attempted' },
    ],
  };
}
