import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { EP, brandId } from '@domia/contracts';
import type { TargetSpec, TargetSession, ToolOutput, Outcome } from '@domia/contracts';
import { htmlToMarkdown } from '@domia/tools';
import { bootTest, must, type Harness } from './harness.js';

const PAGE = `<!doctype html><html><head><title>Sample Page</title><style>.x{}</style></head>
<body><h1>Heading One</h1><p>First paragraph with a <a href="/next">link here</a>.</p>
<ul><li>alpha</li><li>beta</li></ul><script>var x=1;</script></body></html>`;

const call = (s: TargetSession, name: string, args: Record<string, unknown> = {}) =>
  s.invoke({ callId: brandId<'CallId'>(`c${Math.random().toString(36).slice(2, 8)}`), name, args });

function okValue(r: Awaited<ReturnType<typeof call>>): ToolOutput {
  const outcome: Outcome<ToolOutput> = must(r);
  if (outcome.status !== 'ok') throw new Error(`tool failed: ${outcome.error.code} ${outcome.error.message}`);
  return outcome.value;
}

describe('scrape: pluggable web drivers', () => {
  let h: Harness;
  let server: Server;
  let target: TargetSpec;

  beforeAll(async () => {
    h = await bootTest();
    server = createServer((req, res) => {
      if (req.url === '/hang') return; // never responds — exercises adaptive timeout
      res.setHeader('content-type', 'text/html');
      res.end(PAGE);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    target = { kind: 'web', url: `http://127.0.0.1:${port}/` };
  });
  afterAll(async () => { await new Promise((r) => server.close(r)); await h.dispose(); });

  it('extracts markdown, text and absolute links from HTML', () => {
    const out = htmlToMarkdown(PAGE, 'http://host/');
    expect(out.title).toBe('Sample Page');
    expect(out.markdown).toContain('# Heading One');
    expect(out.markdown).toContain('[link here](http://host/next)');
    expect(out.markdown).toContain('- alpha');
    expect(out.markdown).not.toContain('var x=1');
    expect(out.links).toEqual([{ href: 'http://host/next', text: 'link here' }]);
  });

  it('drives a web target with the fetch-scrape driver (no browser)', async () => {
    const session = must(await h.resolve(EP.ToolService).allocSession(target, { driver: 'fetch-scrape' }));
    try {
      const names = session.manifests().map((m) => m.name);
      expect(names).toContain('fetch.get');
      expect(names.some((n) => n.startsWith('browser.'))).toBe(false);

      const obs = must(await session.observe());
      if (obs.status !== 'ok') throw new Error('observe failed');
      expect(obs.value.snapshot.kind).toBe('native');
      expect(obs.value.snapshot.text).toContain('Heading One');
      expect(obs.value.title).toBe('Sample Page');

      const got = okValue(await call(session, 'fetch.get', {}));
      expect((got.value as { markdown: string }).markdown).toContain('# Heading One');
      expect(got.observation?.url).toContain('127.0.0.1');
    } finally {
      await session.dispose();
    }
  });

  it('honors a per-call timeoutMs on a slow target (adaptive timing), never blocking the run', async () => {
    const session = must(await h.resolve(EP.ToolService).allocSession(target, { driver: 'fetch-scrape' }));
    try {
      const started = Date.now();
      const outcome = must(await session.invoke({ callId: brandId<'CallId'>('slow'), name: 'fetch.get', args: { url: `${target.kind === 'web' ? target.url.replace(/\/$/, '') : ''}/hang`, timeoutMs: 300 } }));
      const elapsed = Date.now() - started;
      expect(outcome.status).not.toBe('ok'); // timed out rather than succeeding
      expect(elapsed).toBeLessThan(4000); // honored 300ms, not the 20s default — the run kept moving
    } finally {
      await session.dispose();
    }
  });

  it('rejects an unknown driver id with the available list', async () => {
    const r = await h.resolve(EP.ToolService).allocSession(target, { driver: 'nope' });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error.code).toBe('BAD_CONFIG');
      expect(r.error.message).toContain('fetch-scrape');
    }
  });

  it('lists every registered scraper as a target driver', () => {
    const ids = h.resolve(EP.ToolService).providers().map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['playwright-mcp', 'fetch-scrape', 'firecrawl', 'crawl4ai']));
  });
});
