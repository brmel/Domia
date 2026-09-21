import type { FindingDraft } from '@domia/contracts';
import { originOf, probe, probeAll, type ProbeResult } from './probe.js';
import { EXPECTED_FILES, fileChecks } from './checks/files.js';
import { securityChecks } from './checks/security.js';
import { pageChecks } from './checks/page.js';
import type { CoverageClaim, SweepContext } from './checks/types.js';
import { discoverPages } from './discover.js';
import { clusterBy, templateSignature } from './cluster.js';
import { rollupByTemplate, type PageFindings } from './rollup.js';

const DEFAULT_MAX_PAGES = 12;
const DEFAULT_PER_TEMPLATE = 2;
const DEFAULT_CONCURRENCY = 4;

export interface SweepOptions {
  readonly timeoutMs?: number;
  /** Hard cap on pages fetched beyond the origin files — an audit must always finish. */
  readonly maxPages?: number;
  readonly perTemplate?: number;
  readonly concurrency?: number;
}

export interface SweepResult {
  readonly origin: string;
  readonly findings: readonly FindingDraft[];
  readonly coverage: readonly CoverageClaim[];
  readonly probes: number;
  readonly pages: readonly string[];
  readonly templates: number;
  readonly elapsedMs: number;
}

async function pooled<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (let i = cursor++; i < items.length; i = cursor++) results[i] = await fn(items[i]!);
  });
  await Promise.all(workers);
  return results;
}

async function originContext(url: string, opts: SweepOptions): Promise<SweepContext> {
  const origin = originOf(url);
  const paths = EXPECTED_FILES.map((f) => f.path);
  const timeout = opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {};
  const [home, files, httpHome] = await Promise.all([
    probe(url, timeout),
    probeAll(paths.map((p) => `${origin}${p}`), timeout),
    origin.startsWith('https://') ? probe(origin.replace('https://', 'http://'), { ...timeout, timeoutMs: 8_000 }) : Promise.resolve(undefined),
  ]);
  const byPath = new Map<string, ProbeResult>(paths.map((p) => [p, files.get(`${origin}${p}`)!]));
  return { origin, home, files: byPath, ...(httpHome ? { httpHome } : {}) };
}

function pageContext(ctx: SweepContext, page: ProbeResult): SweepContext {
  return { ...ctx, home: page };
}

/**
 * The deterministic pass: fetch, parse, decide. No browser, no model, no judgement —
 * every finding is `verified` because a machine can point at the proof.
 *
 * Scale comes from templates, not from crawling everything: discover the pages a site
 * publishes, group them by structural signature, audit a couple per group, and roll the
 * results back up so a shared-header defect is one finding with a reach, not one per URL.
 */
export async function sweep(url: string, opts: SweepOptions = {}): Promise<SweepResult> {
  const started = Date.now();
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;
  const ctx = await originContext(url, opts);

  const originResults = [fileChecks(ctx), securityChecks(ctx)];
  const originFindings = originResults.flatMap((r) => r.findings);
  const originCoverage = originResults.flatMap((r) => r.coverage);

  if (!ctx.home.ok || maxPages <= 1) {
    const single = pageChecks(ctx);
    return {
      origin: ctx.origin,
      findings: [...originFindings, ...single.findings],
      coverage: mergeCoverage([...originCoverage, ...single.coverage]),
      probes: ctx.files.size + 1 + (ctx.httpHome ? 1 : 0),
      pages: [ctx.home.finalUrl],
      templates: 1,
      elapsedMs: Date.now() - started,
    };
  }

  const discovered = await discoverPages(ctx.origin, ctx.home, ctx.files.get('/robots.txt'), { maxPages, ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}) });
  const fetched = await pooled(
    discovered.filter((u) => u !== ctx.home.finalUrl),
    opts.concurrency ?? DEFAULT_CONCURRENCY,
    (u) => probe(u, opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
  );
  const documents = [ctx.home, ...fetched.filter((p) => p.ok)];

  const clusters = clusterBy(documents, (p) => templateSignature(p.finalUrl, p.body), opts.perTemplate ?? DEFAULT_PER_TEMPLATE);
  const sampledPerSignature = new Map(clusters.map((c) => [c.signature, c.sampled.length]));

  const pageResults: PageFindings[] = [];
  const pageCoverage: CoverageClaim[] = [];
  for (const cluster of clusters) {
    for (const page of cluster.sampled) {
      const result = pageChecks(pageContext(ctx, page));
      pageResults.push({ url: page.finalUrl, signature: cluster.signature, findings: result.findings });
      if (pageCoverage.length === 0) pageCoverage.push(...result.coverage);
    }
  }
  const sampledPages = pageResults.length;

  return {
    origin: ctx.origin,
    findings: [...originFindings, ...rollupByTemplate(pageResults, sampledPerSignature)],
    coverage: mergeCoverage([...originCoverage, ...pageCoverage.map((c) => ({ ...c, notes: `${c.notes ?? ''} (${sampledPages} pages across ${clusters.length} templates)`.trim() }))]),
    probes: ctx.files.size + 1 + fetched.length + (ctx.httpHome ? 1 : 0),
    pages: documents.map((p) => p.finalUrl),
    templates: clusters.length,
    elapsedMs: Date.now() - started,
  };
}

function mergeCoverage(claims: readonly CoverageClaim[]): readonly CoverageClaim[] {
  const byDimension = new Map<string, CoverageClaim>();
  for (const claim of claims) {
    const existing = byDimension.get(claim.dimension);
    if (!existing) { byDimension.set(claim.dimension, claim); continue; }
    byDimension.set(claim.dimension, {
      dimension: claim.dimension,
      executed: existing.executed + claim.executed,
      applicable: existing.applicable + claim.applicable,
      ...(existing.notes || claim.notes ? { notes: [existing.notes, claim.notes].filter(Boolean).join('; ') } : {}),
    });
  }
  return [...byDimension.values()];
}
