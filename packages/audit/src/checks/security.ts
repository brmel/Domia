import type { FindingDraft, Severity } from '@domia/contracts';
import { headerOf } from '../probe.js';
import type { FamilyResult, SweepContext } from './types.js';

interface HeaderRule {
  readonly header: string;
  readonly check: string;
  readonly title: string;
  readonly why: string;
  readonly severity: Severity;
  readonly fix: string;
  readonly snippet: string;
}

const REQUIRED_HEADERS: readonly HeaderRule[] = [
  {
    header: 'content-security-policy', check: 'security.csp-missing', title: 'No Content-Security-Policy',
    why: 'Nothing constrains where scripts may come from, so any injected script executes with full page privileges.',
    severity: 'serious', fix: 'Ship a CSP, starting in report-only mode to find violations without breaking the site.',
    snippet: "Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'",
  },
  {
    header: 'strict-transport-security', check: 'security.hsts-missing', title: 'No HSTS',
    why: 'A first visit over http can be intercepted before the redirect to https happens.',
    severity: 'serious', fix: 'Send HSTS with a long max-age once https is confirmed working everywhere.',
    snippet: 'Strict-Transport-Security: max-age=31536000; includeSubDomains',
  },
  {
    header: 'x-content-type-options', check: 'security.nosniff-missing', title: 'No X-Content-Type-Options',
    why: 'Browsers may sniff a response into a different type than the server declared.',
    severity: 'moderate', fix: 'Send nosniff on every response.',
    snippet: 'X-Content-Type-Options: nosniff',
  },
  {
    header: 'referrer-policy', check: 'security.referrer-policy-missing', title: 'No Referrer-Policy',
    why: 'Full URLs — including paths that may carry identifiers — leak to third parties in the Referer header.',
    severity: 'minor', fix: 'Set a conservative referrer policy.',
    snippet: 'Referrer-Policy: strict-origin-when-cross-origin',
  },
  {
    header: 'permissions-policy', check: 'security.permissions-policy-missing', title: 'No Permissions-Policy',
    why: 'Powerful features (camera, microphone, geolocation) are available to any embedded third party by default.',
    severity: 'minor', fix: 'Disable the features the site does not use.',
    snippet: 'Permissions-Policy: camera=(), microphone=(), geolocation=()',
  },
];

function headerFinding(rule: HeaderRule, ctx: SweepContext, observed: string): FindingDraft {
  return {
    dimension: 'security', check: rule.check, title: rule.title, detail: rule.why,
    severity: rule.severity, confidence: 'verified', source: 'fetch',
    where: { url: ctx.home.finalUrl },
    remediation: {
      summary: rule.fix, effort: 'S', impact: rule.severity === 'serious' ? 'high' : 'medium',
      verification: `curl -sI ${ctx.home.finalUrl} shows ${rule.header}`,
      patch: { language: 'text', snippet: rule.snippet },
    },
    observed,
  };
}

function cspWeaknesses(ctx: SweepContext, csp: string): readonly FindingDraft[] {
  const weak: string[] = [];
  if (/'unsafe-inline'/.test(csp)) weak.push("'unsafe-inline' allows injected inline scripts to run");
  if (/'unsafe-eval'/.test(csp)) weak.push("'unsafe-eval' allows string-to-code execution");
  if (/(script-src|default-src)[^;]*\*/.test(csp)) weak.push('a wildcard source lets any host serve scripts');
  if (!/object-src/.test(csp)) weak.push("no object-src, so plugin content is not blocked ('none' is the safe value)");
  if (weak.length === 0) return [];
  return [{
    dimension: 'security', check: 'security.csp-weak', title: 'Content-Security-Policy is present but permissive',
    detail: `The policy exists, which is good, but it does not constrain what it needs to: ${weak.join('; ')}.`,
    severity: 'moderate', confidence: 'verified', source: 'fetch',
    where: { url: ctx.home.finalUrl },
    remediation: {
      summary: 'Remove the unsafe sources; use nonces or hashes for the inline scripts that remain.',
      effort: 'M', impact: 'high',
      verification: 'the policy no longer contains unsafe-inline, unsafe-eval or wildcard script sources',
      patch: { language: 'text', snippet: "Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-<per-request>'; object-src 'none'; base-uri 'self'" },
    },
    observed: csp.slice(0, 600),
  }];
}

function cookieFindings(ctx: SweepContext): readonly FindingDraft[] {
  const flawed = ctx.home.setCookies.filter((c) => !/;\s*secure/i.test(c) || !/;\s*httponly/i.test(c) || !/;\s*samesite/i.test(c));
  if (flawed.length === 0) return [];
  return [{
    dimension: 'security', check: 'security.cookie-flags', title: 'Cookies set without the full flag set',
    detail: `${flawed.length} cookie(s) are missing Secure, HttpOnly or SameSite, which widens both interception and CSRF exposure.`,
    severity: 'moderate', confidence: 'verified', source: 'fetch',
    where: { url: ctx.home.finalUrl },
    remediation: {
      summary: 'Set Secure, HttpOnly (where the cookie is not read by scripts) and an explicit SameSite.',
      effort: 'S', impact: 'medium',
      verification: 'every Set-Cookie on the document response carries Secure; HttpOnly; SameSite',
      patch: { language: 'text', snippet: 'Set-Cookie: session=…; Secure; HttpOnly; SameSite=Lax; Path=/' },
    },
    observed: flawed.map((c) => c.split(';')[0] + '; ' + c.split(';').slice(1).join(';').trim()).join('\n').slice(0, 600),
  }];
}

function transportFindings(ctx: SweepContext): readonly FindingDraft[] {
  const out: FindingDraft[] = [];
  if (!ctx.home.finalUrl.startsWith('https://')) {
    out.push({
      dimension: 'security', check: 'security.no-https', title: 'The site does not serve over HTTPS',
      detail: 'Traffic can be read and modified in transit, and modern browser features are unavailable.',
      severity: 'blocker', confidence: 'verified', source: 'fetch',
      where: { url: ctx.home.finalUrl },
      remediation: { summary: 'Serve everything over TLS and redirect http to https.', effort: 'M', impact: 'high', verification: `${ctx.origin} loads over https` },
      observed: `final URL: ${ctx.home.finalUrl}`,
    });
  }
  const http = ctx.httpHome;
  if (http && http.status !== 0 && !http.finalUrl.startsWith('https://')) {
    out.push({
      dimension: 'security', check: 'security.no-https-upgrade', title: 'http:// is not redirected to https://',
      detail: 'A visitor typing the bare domain stays on an unencrypted connection.',
      severity: 'serious', confidence: 'verified', source: 'fetch',
      where: { url: http.url },
      remediation: { summary: 'Return a 301 from http to the https origin.', effort: 'S', impact: 'high', verification: `curl -sI ${http.url} returns 301 to https` },
      observed: `${http.url} → HTTP ${http.status}, final ${http.finalUrl}`,
    });
  }
  const banner = [headerOf(ctx.home, 'server'), headerOf(ctx.home, 'x-powered-by')].filter(Boolean).join(' · ');
  // A product name that happens to contain a digit ("AmazonS3", "nginx") is not a version.
  if (banner && /\d+\.\d+/.test(banner)) {
    out.push({
      dimension: 'security', check: 'security.version-banner', title: 'Server advertises its software version',
      detail: 'Version banners let an attacker match known CVEs to the stack without probing.',
      severity: 'minor', confidence: 'verified', source: 'fetch',
      where: { url: ctx.home.finalUrl },
      remediation: { summary: 'Strip version details from Server and remove X-Powered-By.', effort: 'S', impact: 'low', verification: 'response headers carry no version numbers' },
      observed: banner,
    });
  }
  return out;
}

/** T0 — passive security only: what the origin volunteers in its own responses. */
export function securityChecks(ctx: SweepContext): FamilyResult {
  const findings: FindingDraft[] = [];
  const headerSnapshot = Object.entries(ctx.home.headers).map(([k, v]) => `${k}: ${v}`).join('\n').slice(0, 1200);

  for (const rule of REQUIRED_HEADERS) {
    if (!headerOf(ctx.home, rule.header)) findings.push(headerFinding(rule, ctx, headerSnapshot));
  }
  const csp = headerOf(ctx.home, 'content-security-policy');
  if (csp) findings.push(...cspWeaknesses(ctx, csp));
  findings.push(...cookieFindings(ctx), ...transportFindings(ctx));

  const executed = REQUIRED_HEADERS.length + 4;
  return {
    findings,
    coverage: [{
      dimension: 'security', executed, applicable: executed,
      notes: 'passive checks only — no TLS cipher inspection, dependency CVEs or active probing',
    }],
  };
}
