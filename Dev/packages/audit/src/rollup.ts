import type { FindingDraft } from '@domia/contracts';

export interface PageFindings {
  readonly url: string;
  readonly signature: string;
  readonly findings: readonly FindingDraft[];
}

const MAX_EXAMPLES = 3;

/**
 * One finding per (check, template) instead of one per URL. The count of affected pages
 * moves into `reach`, which is what the score already weighs — so a defect in a shared
 * header reads as one line that says "12 of 12 sampled pages", not twelve lines.
 */
export function rollupByTemplate(pages: readonly PageFindings[], sampledPerSignature: ReadonlyMap<string, number>): readonly FindingDraft[] {
  const groups = new Map<string, { first: FindingDraft; urls: string[]; signature: string }>();

  for (const page of pages) {
    for (const finding of page.findings) {
      const key = `${finding.check}|${page.signature}`;
      const existing = groups.get(key);
      if (existing) { existing.urls.push(page.url); continue; }
      groups.set(key, { first: finding, urls: [page.url], signature: page.signature });
    }
  }

  return [...groups.values()].map(({ first, urls, signature }) => {
    const sampled = sampledPerSignature.get(signature) ?? urls.length;
    const examples = urls.slice(0, MAX_EXAMPLES);
    const moreCount = urls.length - examples.length;
    return {
      ...first,
      where: { ...first.where, url: urls[0] ?? first.where.url, template: signature },
      reach: { affected: urls.length, sampled },
      observed: [
        first.observed,
        `seen on ${urls.length} of ${sampled} sampled pages in this template: ${examples.join(', ')}${moreCount > 0 ? ` (+${moreCount} more)` : ''}`,
      ].filter(Boolean).join('\n\n'),
    };
  });
}
