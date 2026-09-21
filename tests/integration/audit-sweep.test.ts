import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { bootHeadless, startRun } from '@domia/hosts';
import { EP } from '@domia/contracts';
import type { AgentTurn, ModelRef } from '@domia/contracts';
import { must, tmpDir } from './harness.js';
import { createServer, type Server } from 'node:http';
import { gzipSync } from 'node:zlib';
import type { AddressInfo } from 'node:net';
import { sweep, disallowedPaths, linksFrom, locsFrom, normalize, templateSignature, pathShape, clusterBy, rollupByTemplate } from '@domia/audit';

const RICH_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Fixture shop — everything in its place</title>
  <meta name="description" content="A fixture page that carries a full head: description, canonical, Open Graph, and real body copy so the sweep has nothing to complain about.">
  <link rel="canonical" href="http://127.0.0.1/">
  <meta property="og:title" content="Fixture shop">
  <meta property="og:description" content="A fixture page with a complete Open Graph card.">
</head>
<body>
  <h1>Fixture shop</h1>
  <p>${'Real server-rendered copy. '.repeat(20)}</p>
</body>
</html>`;

const SPA_HTML = `<!doctype html>
<html>
<head><title>app</title></head>
<body><div id="root"></div><script type="module" src="/app.js"></script></body>
</html>`;

const GOOD_HEADERS: Record<string, string> = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'",
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=()',
  'cache-control': 'public, max-age=300',
  'content-encoding': 'gzip',
  server: 'AmazonS3',
};

const RICH_HTML_GZIP = gzipSync(Buffer.from(RICH_HTML, 'utf8'));

const GOOD_FILES: Record<string, string> = {
  '/robots.txt': 'User-agent: *\nAllow: /\nSitemap: http://127.0.0.1/sitemap.xml\nContent-Signal: ai-train=no\n',
  '/sitemap.xml': '<?xml version="1.0"?><urlset></urlset>',
  '/llms.txt': '# Fixture\n\n> A fixture site.\n',
  '/ai.txt': 'User-agent: *\n',
  '/.well-known/security.txt': 'Contact: mailto:security@example.com\n',
  '/.well-known/agent-card.json': '{}',
  '/.well-known/api-catalog': '{}',
  '/.well-known/change-password': 'ok',
  '/manifest.webmanifest': '{"name":"Fixture"}',
};

function start(handler: Parameters<typeof createServer>[1]): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

/**
 * Two real HTTP origins, no mocks: one that does everything right and one that does
 * nothing. The first is the precision test — a clean site must produce a clean report.
 */
describe('audit sweep: the deterministic pass over a real origin', () => {
  let good: { server: Server; url: string };
  let bare: { server: Server; url: string };

  beforeAll(async () => {
    good = await start((req, res) => {
      const path = (req.url ?? '/').split('?')[0]!;
      if (path === '/') {
        res.writeHead(200, { ...GOOD_HEADERS, 'content-length': String(RICH_HTML_GZIP.length) });
        res.end(RICH_HTML_GZIP);
        return;
      }
      const body = GOOD_FILES[path];
      if (body === undefined) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(body);
    });
    bare = await start((req, res) => {
      if ((req.url ?? '/') === '/') { res.writeHead(200, { 'content-type': 'text/html', server: 'nginx/1.24.0' }); res.end(SPA_HTML); return; }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    });
  });

  afterAll(() => { good?.server.close(); bare?.server.close(); });

  it('reports only what is actually wrong on a well-built origin', async () => {
    const result = await sweep(good.url);
    const checks = result.findings.map((f) => f.check).sort();

    // The fixture is plain http, so exactly one transport finding is expected — and nothing else.
    expect(checks).toEqual(['security.no-https']);
    expect(result.findings.every((f) => f.confidence === 'verified')).toBe(true);
  });

  it('does not invent a version banner from a product name, nor compression on a tiny document', async () => {
    const result = await sweep(good.url);
    expect(result.findings.map((f) => f.check)).not.toContain('security.version-banner');
    expect(result.findings.map((f) => f.check)).not.toContain('network.compression');
  });

  it('catches the missing files, headers and head tags on a bare origin', async () => {
    const result = await sweep(bare.url);
    const checks = new Set(result.findings.map((f) => f.check));

    expect(checks).toContain('files.robots-txt');
    expect(checks).toContain('seo.sitemap');
    expect(checks).toContain('agentic.llms-txt');
    expect(checks).toContain('security.csp-missing');
    expect(checks).toContain('security.hsts-missing');
    expect(checks).toContain('seo.description-missing');
    expect(checks).toContain('seo.canonical-missing');
    expect(checks).toContain('language.html-lang');
    expect(checks).toContain('seo.client-rendered');
    expect(checks, 'nginx/1.24.0 is a real version banner').toContain('security.version-banner');
  });

  it('gives every finding evidence, a fix and a verification', async () => {
    const result = await sweep(bare.url);
    for (const f of result.findings) {
      expect(f.observed?.length ?? 0, `${f.check} must carry observed proof`).toBeGreaterThan(0);
      expect(f.remediation.summary.length).toBeGreaterThan(0);
      expect(f.remediation.verification.length).toBeGreaterThan(0);
      expect(f.source).toBe('fetch');
    }
  });

  it('claims coverage per dimension, never more than it ran', async () => {
    const result = await sweep(bare.url);
    const dimensions = result.coverage.map((c) => c.dimension).sort();
    expect(dimensions).toEqual(['agentic', 'files', 'language', 'network', 'security', 'seo']);
    for (const c of result.coverage) {
      expect(c.executed).toBeGreaterThan(0);
      expect(c.executed).toBeLessThanOrEqual(c.applicable);
      expect(c.notes, `${c.dimension} should say what it did not cover`).toBeTruthy();
    }
  });

  it('crawls a multi-page site, samples per template, and reports reach instead of repetition', async () => {
    const site = await start((req, res) => {
      const path = (req.url ?? '/').split('?')[0]!;
      if (path === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('User-agent: *\nDisallow: /admin\nSitemap: http://127.0.0.1:PORT/sitemap.xml\n'.replace('PORT', String(sitePort))); return; }
      if (path === '/sitemap.xml') {
        const urls = ['/', '/blog/first-post-here', '/blog/second-post-here', '/blog/third-post-here', '/admin/secret']
          .map((u) => `<url><loc>http://127.0.0.1:${sitePort}${u}</loc></url>`).join('');
        res.writeHead(200, { 'content-type': 'application/xml' });
        res.end(`<?xml version="1.0"?><urlset>${urls}</urlset>`);
        return;
      }
      if (path.startsWith('/blog/')) {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<html lang="en"><head><meta charset="utf-8"><title>Post</title></head><body><article><h1>Post</h1><p>${'Body copy. '.repeat(30)}</p></article></body></html>`);
        return;
      }
      if (path === '/admin/secret') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><body>secret</body></html>'); return; }
      if (path === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<html lang="en"><head><meta charset="utf-8"><title>Home</title></head><body><main><h1>Home</h1><p>${'Welcome. '.repeat(30)}</p></main></body></html>`); return; }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    });
    const sitePort = (site.server.address() as AddressInfo).port;

    try {
      const result = await sweep(site.url, { maxPages: 10, perTemplate: 2 });

      expect(result.pages.length, 'home plus the blog template').toBeGreaterThan(1);
      expect(result.pages.some((u) => u.includes('/admin')), 'robots Disallow is honoured').toBe(false);
      expect(result.templates).toBeGreaterThan(1);

      const perTemplate = result.findings.filter((f) => f.check === 'seo.description-missing');
      expect(perTemplate.length, 'one finding per template, not per URL').toBeLessThanOrEqual(result.templates);
      const blog = perTemplate.find((f) => f.where.url.includes('/blog/'));
      expect(blog?.reach.affected, 'reach carries how many pages share the defect').toBeGreaterThan(1);
      expect(blog?.where.template).toContain('/blog/:slug');
    } finally {
      site.server.close();
    }
  }, 60_000);

  it('degrades to one blocker when the origin is unreachable', async () => {
    const result = await sweep('http://127.0.0.1:1/');
    expect(result.findings.some((f) => f.check === 'network.unreachable' && f.severity === 'blocker')).toBe(true);
  });

  it('shapes URLs into templates and clusters by structure', () => {
    expect(pathShape('https://x.test/blog/2026/my-long-post-title')).toBe('/blog/:n/:slug');
    expect(pathShape('https://x.test/users/550e8400-e29b-41d4-a716-446655440000')).toBe('/users/:uuid');
    expect(pathShape('https://x.test/')).toBe('/');

    const listing = '<html><body><main><h1>a</h1><section></section><section></section></main></body></html>';
    const detail = '<html><body><article><h1>a</h1><form></form></article></body></html>';
    const a = templateSignature('https://x.test/blog/one-two-three', listing);
    const b = templateSignature('https://x.test/blog/four-five-six', listing);
    const c = templateSignature('https://x.test/blog/seven-eight-nine', detail);
    expect(a).toBe(b);
    expect(a).not.toBe(c);

    const clusters = clusterBy([a, b, c], (x) => x, 2);
    expect(clusters).toHaveLength(2);
  });

  it('reads robots rules, sitemap locs and same-origin links', () => {
    expect(disallowedPaths('User-agent: *\nDisallow: /admin\nDisallow: /tmp\n\nUser-agent: Bad\nDisallow: /'))
      .toEqual(['/admin', '/tmp']);
    expect(locsFrom('<urlset><url><loc>https://x.test/a</loc></url><url><loc>https://x.test/b</loc></url></urlset>'))
      .toEqual(['https://x.test/a', 'https://x.test/b']);
    expect(linksFrom('<a href="/a">A</a><a href="https://other.test/b">B</a><a href="/style.css">C</a>', 'https://x.test'))
      .toEqual(['https://x.test/a']);
    expect(normalize('/a/?q=1#top', 'https://x.test')).toBe('https://x.test/a');
  });

  it('rolls page findings up to one row per template with a reach', () => {
    const draft = {
      dimension: 'seo' as const, check: 'seo.title-missing', title: 'no title', detail: '',
      severity: 'moderate' as const, confidence: 'verified' as const, source: 'fetch' as const,
      where: { url: 'https://x.test/a' },
      remediation: { summary: 'add one', effort: 'S' as const, impact: 'low' as const, verification: 'view source' },
      observed: 'no <title>',
    };
    const rolled = rollupByTemplate(
      [
        { url: 'https://x.test/a', signature: '/blog/:slug#abcd', findings: [draft] },
        { url: 'https://x.test/b', signature: '/blog/:slug#abcd', findings: [draft] },
      ],
      new Map([['/blog/:slug#abcd', 2]]),
    );
    expect(rolled).toHaveLength(1);
    expect(rolled[0]?.reach).toEqual({ affected: 2, sampled: 2 });
    expect(rolled[0]?.observed).toContain('seen on 2 of 2 sampled pages');
  });

  it('reaches the agent as audit.sweep, and scores the dimensions it covered', async () => {
    const script: AgentTurn[] = [
      { kind: 'act', calls: [{ name: 'audit.sweep', args: { url: bare.url } }] },
      { kind: 'act', calls: [{ name: 'audit.report', args: { target: bare.url } }] },
      { kind: 'final', summary: 'deterministic pass done' },
    ];
    const dataDir = tmpDir('sweep');
    const booted = must(await bootHeadless({
      dataDir, artifactsDir: join(dataDir, 'artifacts'), dbPath: join(dataDir, 'domia.db'), logLevel: 'error',
      agent: { replay: () => script },
    }));
    const { kernel } = booted;
    try {
      const caseId = must(await kernel.resolve(EP.CaseService)._unsafeUnwrap().create({
        name: 'sweep case', target: { kind: 'web', url: bare.url },
      })).id;
      const model: ModelRef = { provider: 'replay', model: 'scripted' };
      const started = must(await startRun(kernel, { caseId, request: 'sweep it', model, maxTurns: 6 }));
      expect(started.outcome.status).toBe('ok');

      const audit = kernel.resolve(EP.AuditService)._unsafeUnwrap();
      const findings = audit.findings(started.runId);
      expect(findings.length).toBeGreaterThan(8);
      expect(findings.every((f) => f.evidence.length > 0), 'the sweep persists observed proof for each finding').toBe(true);

      const score = audit.score(started.runId);
      const security = score.dimensions.find((d) => d.dimension === 'security');
      const theme = score.dimensions.find((d) => d.dimension === 'theme');
      expect(security?.score).toBeLessThan(100);
      expect(theme?.score, 'a dimension the sweep cannot reach stays unassessed').toBeUndefined();
      expect(score.assessed).toBe(6);
    } finally {
      await kernel.shutdown();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }, 60_000);
});
