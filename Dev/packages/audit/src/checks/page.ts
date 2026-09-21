import type { FindingDraft } from '@domia/contracts';
import { headerOf } from '../probe.js';
import { countTags, hasCharset, htmlLang, linkHref, metaContent, tagText } from './html.js';
import type { FamilyResult, SweepContext } from './types.js';

const TITLE_MAX = 60;
const DESCRIPTION_MIN = 50;
const SLOW_TTFB_MS = 1500;
// Below one network packet there is nothing for compression to save.
const COMPRESSIBLE_MIN_BYTES = 1400;

function clientRenderedFinding(ctx: SweepContext, html: string): readonly FindingDraft[] {
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? '';
  const visibleText = body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '').trim();
  const mountPoint = /<div[^>]*id\s*=\s*["'](root|app|__next)["'][^>]*>\s*<\/div>/i.test(body);
  if (!mountPoint || visibleText.length > 200) return [];
  return [{
    dimension: 'seo', check: 'seo.client-rendered', title: 'The served HTML contains no content',
    detail: 'The document is an empty shell that fills in after JavaScript runs. Crawlers and agents that do not execute scripts — and every one that gives up before hydration finishes — see nothing at all. This is the root cause behind the missing heading, description and structured data below.',
    severity: 'serious', confidence: 'verified', source: 'fetch',
    where: { url: ctx.home.finalUrl },
    remediation: {
      summary: 'Server-render or pre-render at least the head metadata and the primary copy of each indexable route.',
      effort: 'L', impact: 'high',
      verification: 'curl of the page shows the heading and description without running scripts',
    },
    observed: `body text before scripts run: ${visibleText.length} characters\n${body.trim().slice(0, 300)}`,
  }];
}

function seoFindings(ctx: SweepContext, html: string): readonly FindingDraft[] {
  const url = ctx.home.finalUrl;
  const out: FindingDraft[] = [];
  const add = (f: Omit<FindingDraft, 'dimension' | 'confidence' | 'source' | 'where'>): void => {
    out.push({ ...f, dimension: 'seo', confidence: 'verified', source: 'fetch', where: { url } });
  };

  const title = tagText(html, 'title');
  if (!title) {
    add({
      check: 'seo.title-missing', title: 'Home page has no <title>', detail: 'Search results and browser tabs fall back to the URL.',
      severity: 'serious',
      remediation: { summary: 'Add a descriptive title under 60 characters.', effort: 'S', impact: 'high', verification: 'view-source shows a <title>' },
      observed: html.slice(0, 300),
    });
  } else if (title.length > TITLE_MAX) {
    add({
      check: 'seo.title-long', title: 'Title is longer than search results display', detail: `The title is ${title.length} characters; results truncate near ${TITLE_MAX}.`,
      severity: 'minor',
      remediation: { summary: `Shorten the title to about ${TITLE_MAX} characters.`, effort: 'S', impact: 'low', verification: 'title length <= 60' },
      observed: title,
    });
  }

  const description = metaContent(html, 'name', 'description');
  if (!description) {
    add({
      check: 'seo.description-missing', title: 'No meta description', detail: 'Search engines and social cards invent their own snippet.',
      severity: 'moderate',
      remediation: { summary: 'Add a meta description of 120–160 characters.', effort: 'S', impact: 'medium', verification: 'the page carries <meta name="description">' },
      observed: 'no <meta name="description"> in the served HTML',
    });
  } else if (description.length < DESCRIPTION_MIN) {
    add({
      check: 'seo.description-thin', title: 'Meta description is very short', detail: `${description.length} characters carries little information into the snippet.`,
      severity: 'minor',
      remediation: { summary: 'Expand the description to 120–160 characters.', effort: 'S', impact: 'low', verification: 'description length >= 120' },
      observed: description,
    });
  }

  if (!linkHref(html, 'canonical')) {
    add({
      check: 'seo.canonical-missing', title: 'No canonical link', detail: 'Duplicate URLs (parameters, trailing slashes, http/https) can each be indexed separately.',
      severity: 'moderate',
      remediation: { summary: 'Add <link rel="canonical"> pointing at the preferred URL.', effort: 'S', impact: 'medium', verification: 'the page carries a self-referencing canonical' },
      observed: 'no <link rel="canonical"> in the served HTML',
    });
  }

  if (!metaContent(html, 'property', 'og:title') || !metaContent(html, 'property', 'og:description')) {
    add({
      check: 'seo.open-graph', title: 'Open Graph tags incomplete', detail: 'Shared links render without a controlled title, description or image.',
      severity: 'minor',
      remediation: { summary: 'Add og:title, og:description and og:image.', effort: 'S', impact: 'medium', verification: 'a share preview shows the intended card' },
      observed: `og:title=${metaContent(html, 'property', 'og:title') ?? 'missing'} · og:description=${metaContent(html, 'property', 'og:description') ?? 'missing'}`,
    });
  }

  const h1 = countTags(html, 'h1');
  if (h1 === 0) {
    add({
      check: 'seo.h1-missing', title: 'No <h1> in the served HTML', detail: 'The page states no primary heading to crawlers or assistive technology reading the initial response.',
      severity: 'moderate',
      remediation: { summary: 'Give the page exactly one <h1> describing it.', effort: 'S', impact: 'medium', verification: 'the served HTML contains one <h1>' },
      observed: `<h1> count in the initial HTML: 0 (rendered DOM not inspected in this pass)`,
    });
  }
  return out;
}

function languageFindings(ctx: SweepContext, html: string): readonly FindingDraft[] {
  const out: FindingDraft[] = [];
  if (!htmlLang(html)) {
    out.push({
      dimension: 'language', check: 'language.html-lang', title: 'No lang attribute on <html>',
      detail: 'Screen readers cannot choose a pronunciation, and translation tools cannot detect the source language reliably.',
      severity: 'serious', confidence: 'verified', source: 'fetch',
      standards: ['WCAG 2.2 SC 3.1.1', 'EN 301 549 9.3.1.1'],
      where: { url: ctx.home.finalUrl },
      remediation: { summary: 'Set <html lang="…"> to the page language.', effort: 'S', impact: 'high', verification: 'the html element carries a valid lang' },
      observed: /<html[^>]*>/i.exec(html)?.[0] ?? 'no <html> element found',
    });
  }
  if (!hasCharset(html)) {
    out.push({
      dimension: 'language', check: 'language.charset', title: 'No charset declaration',
      detail: 'Without an explicit charset the browser guesses, which is how mojibake reaches production.',
      severity: 'minor', confidence: 'verified', source: 'fetch',
      where: { url: ctx.home.finalUrl },
      remediation: { summary: 'Add <meta charset="utf-8"> as the first element in <head>.', effort: 'S', impact: 'low', verification: 'view-source shows the charset meta' },
      observed: `content-type: ${headerOf(ctx.home, 'content-type') ?? 'absent'}`,
    });
  }
  return out;
}

function networkFindings(ctx: SweepContext): readonly FindingDraft[] {
  const out: FindingDraft[] = [];
  const encoding = headerOf(ctx.home, 'content-encoding');
  const declaredLength = Number(headerOf(ctx.home, 'content-length') ?? NaN);
  const bodyBytes = Number.isFinite(declaredLength) ? declaredLength : ctx.home.body.length;
  if (!encoding && bodyBytes >= COMPRESSIBLE_MIN_BYTES) {
    out.push({
      dimension: 'network', check: 'network.compression', title: 'HTML is served uncompressed',
      detail: 'Text compresses 3–5×; serving it raw costs bandwidth and time on every visit.',
      severity: 'moderate', confidence: 'verified', source: 'fetch',
      where: { url: ctx.home.finalUrl },
      remediation: { summary: 'Enable brotli (or gzip) for text responses at the edge.', effort: 'S', impact: 'medium', verification: 'response carries content-encoding: br' },
      observed: `content-encoding: absent · ${bodyBytes} bytes · vary: ${headerOf(ctx.home, 'vary') ?? 'absent'}`,
    });
  }
  if (!headerOf(ctx.home, 'cache-control')) {
    out.push({
      dimension: 'network', check: 'network.cache-control', title: 'No Cache-Control on the document',
      detail: 'Caching behaviour is left to heuristics, so revalidation and CDN behaviour are unpredictable.',
      severity: 'minor', confidence: 'verified', source: 'fetch',
      where: { url: ctx.home.finalUrl },
      remediation: { summary: 'Send an explicit Cache-Control for the document.', effort: 'S', impact: 'low', verification: 'response carries cache-control' },
      observed: Object.keys(ctx.home.headers).join(', ').slice(0, 400),
    });
  }
  if (ctx.home.elapsedMs > SLOW_TTFB_MS) {
    out.push({
      dimension: 'network', check: 'network.slow-document', title: 'Slow document response',
      detail: `The HTML took ${ctx.home.elapsedMs}ms to arrive from this vantage point, before any asset loads.`,
      severity: 'moderate', confidence: 'probable', source: 'fetch',
      where: { url: ctx.home.finalUrl },
      remediation: { summary: 'Check origin latency, caching at the edge, and whether the document is server-rendered per request.', effort: 'M', impact: 'high', verification: 'document response consistently under 800ms from the same vantage' },
      observed: `single-vantage measurement: ${ctx.home.elapsedMs}ms · cf-cache-status: ${headerOf(ctx.home, 'cf-cache-status') ?? 'n/a'} · server: ${headerOf(ctx.home, 'server') ?? 'n/a'}`,
    });
  }
  return out;
}

/** T0 — everything the served document itself proves: SEO head, language, delivery. */
export function pageChecks(ctx: SweepContext): FamilyResult {
  if (!ctx.home.ok) {
    return {
      findings: [{
        dimension: 'network', check: 'network.unreachable', title: 'The site did not return a usable response',
        detail: 'Nothing else could be assessed from this vantage point.',
        severity: 'blocker', confidence: 'verified', source: 'fetch',
        where: { url: ctx.home.url },
        remediation: { summary: 'Check DNS, TLS and origin availability.', effort: 'M', impact: 'high', verification: `${ctx.origin} returns 200` },
        observed: ctx.home.error ?? `HTTP ${ctx.home.status}`,
      }],
      coverage: [{ dimension: 'network', executed: 1, applicable: 4, notes: 'origin unreachable' }],
    };
  }

  const html = ctx.home.body;
  return {
    findings: [...clientRenderedFinding(ctx, html), ...seoFindings(ctx, html), ...languageFindings(ctx, html), ...networkFindings(ctx)],
    coverage: [
      { dimension: 'seo', executed: 7, applicable: 7, notes: 'served HTML only — no crawl, no rendered DOM, no structured-data validation' },
      { dimension: 'language', executed: 2, applicable: 2, notes: 'document-level only — no locale matrix, no translation completeness' },
      { dimension: 'network', executed: 3, applicable: 3, notes: 'single request from one vantage — no protocol, CDN or waterfall analysis' },
    ],
  };
}
