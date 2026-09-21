import { createHash } from 'node:crypto';

const STRUCTURAL_TAGS = ['header', 'nav', 'main', 'footer', 'aside', 'article', 'section', 'form', 'table', 'h1', 'h2', 'h3', 'img', 'video'] as const;
const NUMERIC = /^\d+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASHY = /^[0-9a-f]{12,}$/i;
const SLUGGY = /^[a-z0-9]+(?:-[a-z0-9]+){2,}$/i;

/** `/blog/2026/my-long-post-title` → `/blog/:n/:slug`, so one finding covers the template. */
export function pathShape(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  if (segments.length === 0) return '/';
  const shaped = segments.map((s) => {
    if (NUMERIC.test(s)) return ':n';
    if (UUID.test(s)) return ':uuid';
    if (HASHY.test(s)) return ':hash';
    if (SLUGGY.test(s)) return ':slug';
    return s.toLowerCase();
  });
  return `/${shaped.join('/')}`;
}

/** A coarse count of the structural tags — enough to separate a listing from a detail page. */
export function structuralHash(html: string): string {
  const bucketed = STRUCTURAL_TAGS.map((tag) => {
    const count = html.match(new RegExp(`<${tag}[\\s>]`, 'gi'))?.length ?? 0;
    const bucket = count === 0 ? 0 : count === 1 ? 1 : count <= 4 ? 2 : count <= 12 ? 3 : 4;
    return `${tag}${bucket}`;
  }).join(':');
  return createHash('sha256').update(bucketed).digest('hex').slice(0, 8);
}

export function templateSignature(url: string, html: string): string {
  return `${pathShape(url)}#${structuralHash(html)}`;
}

export interface Sampled<T> {
  readonly signature: string;
  readonly members: readonly T[];
  readonly sampled: readonly T[];
}

/**
 * Cluster by template, then audit a few members of each. A 100k-page site has a handful
 * of templates; auditing every URL costs a fortune and says the same thing 100k times.
 */
export function clusterBy<T>(items: readonly T[], signatureOf: (item: T) => string, perCluster: number): readonly Sampled<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const signature = signatureOf(item);
    const bucket = groups.get(signature);
    if (bucket) bucket.push(item);
    else groups.set(signature, [item]);
  }
  return [...groups.entries()].map(([signature, members]) => ({
    signature,
    members,
    sampled: members.slice(0, perCluster),
  }));
}
