import type { Dimension, DimensionInfo } from '@domia/contracts';

export const DIMENSIONS: readonly DimensionInfo[] = [
  {
    id: 'performance', title: 'Performance & Web Vitals', k: 60, defaultWeight: 1,
    summary: 'LCP/INP/CLS/TTFB per journey step, weight budgets, third-party cost, regressions against a baseline.',
  },
  {
    id: 'accessibility', title: 'Accessibility & assistive semantics', k: 70, defaultWeight: 1.5,
    summary: 'WCAG rule violations plus what rules cannot see: keyboard journeys, focus order, screen-reader narrative, visual-vs-DOM order.',
  },
  {
    id: 'theme', title: 'Theme & visual integrity', k: 50, defaultWeight: 0.8,
    summary: 'Light/dark parity, responsive and zoom matrix, reduced-motion and forced-colors, token drift, overflow and overlap.',
  },
  {
    id: 'language', title: 'Language, i18n & content quality', k: 50, defaultWeight: 0.8,
    summary: 'lang and hreflang correctness, translation completeness, RTL, locale formats, readability, cross-page contradictions.',
  },
  {
    id: 'states', title: 'State transitions & resilience', k: 55, defaultWeight: 1.2,
    summary: 'Loading, empty, error and offline states; form validation; back button, refresh, double submit, session expiry, idempotency.',
  },
  {
    id: 'seo', title: 'Classic SEO', k: 60, defaultWeight: 1,
    summary: 'Crawlability, indexability, canonicals, sitemaps, metadata, structured data, internal linking, SSR/CSR parity.',
  },
  {
    id: 'agentic', title: 'Agentic SEO & AI readiness', k: 45, defaultWeight: 1,
    summary: 'llms.txt and AI policy declarations, WebMCP tools, affordance quality, answer extractability, and whether an agent can finish the task.',
  },
  {
    id: 'files', title: 'Machine-readable surface', k: 40, defaultWeight: 0.6,
    summary: 'The files that should exist: robots, sitemap, llms.txt, ai.txt, the .well-known set, manifest, feeds, policy pages.',
  },
  {
    id: 'privacy', title: 'Privacy, consent & trackers', k: 55, defaultWeight: 1.3,
    summary: 'What fires before consent, whether reject actually blocks, refusal cost versus acceptance, cookie inventory against the policy.',
  },
  {
    id: 'security', title: 'Security & hygiene', k: 55, defaultWeight: 1.3,
    summary: 'Headers and CSP strength, cookie flags, TLS, supply chain and SRI, vulnerable libraries, exposed paths, email auth. Active probing needs written scope.',
  },
  {
    id: 'journey', title: 'Journey completion & friction', k: 50, defaultWeight: 1.5,
    summary: 'Can the task be completed, at what cost, with what recovery — including cancellation asymmetry and deceptive patterns.',
  },
  {
    id: 'network', title: 'Networking & delivery', k: 60, defaultWeight: 1,
    summary: 'DNS, protocol and TLS handshake, CDN cache behaviour, compression, resource hints, critical path, bfcache, endpoint reliability.',
  },
];

const BY_ID = new Map<Dimension, DimensionInfo>(DIMENSIONS.map((d) => [d.id, d]));

export function dimensionInfo(id: Dimension): DimensionInfo | undefined {
  return BY_ID.get(id);
}

export function isDimension(value: string): value is Dimension {
  return BY_ID.has(value as Dimension);
}
