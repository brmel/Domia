import { probe, type ProbeResult } from './probe.js';

const ASSET = /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|json|xml|txt|pdf|zip|mp4|webm|woff2?)$/i;
const MAX_SITEMAPS = 5;

export interface DiscoveryBudget {
  readonly maxPages: number;
  readonly timeoutMs?: number;
}

/** Disallow rules that apply to every crawler, which is the only group we honour. */
export function disallowedPaths(robots: string): readonly string[] {
  const lines = robots.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim());
  const rules: string[] = [];
  let inWildcardGroup = false;
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') { inWildcardGroup = value === '*'; continue; }
    if (inWildcardGroup && key === 'disallow' && value) rules.push(value);
  }
  return rules;
}

export function isAllowed(url: string, disallowed: readonly string[]): boolean {
  const path = new URL(url).pathname;
  return !disallowed.some((rule) => path.startsWith(rule));
}

export function normalize(candidate: string, origin: string): string | null {
  try {
    const url = new URL(candidate, origin);
    if (url.origin !== origin) return null;
    if (ASSET.test(url.pathname)) return null;
    url.hash = '';
    url.search = '';
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.origin}${path}`;
  } catch {
    return null;
  }
}

export function linksFrom(html: string, origin: string): readonly string[] {
  const hrefs = [...html.matchAll(/<a[^>]+href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1] ?? '');
  const seen = new Set<string>();
  for (const href of hrefs) {
    const normalized = normalize(href, origin);
    if (normalized) seen.add(normalized);
  }
  return [...seen];
}

export function locsFrom(xml: string): readonly string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1] ?? '').filter(Boolean);
}

async function fromSitemap(sitemapUrl: string, origin: string, budget: DiscoveryBudget): Promise<readonly string[]> {
  const root = await probe(sitemapUrl, budget.timeoutMs ? { timeoutMs: budget.timeoutMs } : {});
  if (!root.ok) return [];
  const locs = locsFrom(root.body);
  const isIndex = /<sitemapindex/i.test(root.body);
  if (!isIndex) return locs.map((l) => normalize(l, origin)).filter((u): u is string => u !== null);

  const children = await Promise.all(
    locs.slice(0, MAX_SITEMAPS).map(async (child) => {
      const page = await probe(child, budget.timeoutMs ? { timeoutMs: budget.timeoutMs } : {});
      return page.ok ? locsFrom(page.body) : [];
    }),
  );
  return children.flat().map((l) => normalize(l, origin)).filter((u): u is string => u !== null);
}

/**
 * Where the audit looks: the sitemap when the site publishes one, the home page's own
 * links when it does not. Robots disallow rules are honoured, assets are skipped, and
 * the budget is a hard cap — an audit of a 100k-page site must still finish.
 */
export async function discoverPages(
  origin: string,
  home: ProbeResult,
  robots: ProbeResult | undefined,
  budget: DiscoveryBudget,
): Promise<readonly string[]> {
  const homeUrl = normalize(home.finalUrl || origin, origin) ?? origin;
  const declared = robots?.ok
    ? [...robots.body.matchAll(/sitemap:\s*(\S+)/gi)].map((m) => m[1] ?? '').filter(Boolean)
    : [];
  const sitemapUrls = declared.length ? declared : [`${origin}/sitemap.xml`];

  const fromSitemaps = (await Promise.all(sitemapUrls.slice(0, MAX_SITEMAPS).map((s) => fromSitemap(s, origin, budget)))).flat();
  const candidates = fromSitemaps.length ? fromSitemaps : linksFrom(home.body, origin);

  const disallowed = robots?.ok ? disallowedPaths(robots.body) : [];
  const unique = [homeUrl, ...candidates.filter((u) => u !== homeUrl)]
    .filter((u, i, all) => all.indexOf(u) === i)
    .filter((u) => isAllowed(u, disallowed));

  return unique.slice(0, budget.maxPages);
}
