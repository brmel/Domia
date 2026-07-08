import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import type { AddressInfo } from 'net';
import { PlaywrightAdapter } from '@infrastructure/playwright/PlaywrightAdapter';
import { ConsoleLogger } from '@infrastructure/ConsoleLogger';
import { UrlFactory } from '@domain/value-objects/Brand';

const SLOW_RESOURCE_DELAY_MS = 3_000;
const LATE_BUTTON_DELAY_MS = 1_500;

const PAGE_HTML = `<!DOCTYPE html>
<html><head><title>Slow fixture</title></head>
<body>
  <h1>Slow site fixture</h1>
  <img src="/slow.png" alt="slow resource">
  <div id="late-slot"></div>
  <script>
    setTimeout(() => {
      const btn = document.createElement('button');
      btn.textContent = 'Late';
      document.getElementById('late-slot').appendChild(btn);
    }, ${LATE_BUTTON_DELAY_MS});
  </script>
</body></html>`;

function startSlowServer(): Promise<{ baseUrl: string; stop: () => Promise<void> }> {
    const server = http.createServer((req, res) => {
        if (req.url === '/slow.png') {
            setTimeout(() => {
                res.writeHead(200, { 'Content-Type': 'image/png' });
                res.end(Buffer.from('89504e470d0a1a0a', 'hex'));
            }, SLOW_RESOURCE_DELAY_MS);
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(PAGE_HTML);
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as AddressInfo;
            resolve({
                baseUrl: `http://127.0.0.1:${port}`,
                stop: () => new Promise<void>((done) => server.close(() => done())),
            });
        });
    });
}

describe('slow site handling', () => {
    let server: Awaited<ReturnType<typeof startSlowServer>>;
    let adapter: PlaywrightAdapter;

    beforeAll(async () => {
        server = await startSlowServer();
        adapter = new PlaywrightAdapter(new ConsoleLogger());
        const launch = await adapter.launch({ headless: true });
        if (launch.isErr()) throw launch.error;
    }, 30_000);

    afterAll(async () => {
        await adapter.close();
        await server.stop();
    });

    it('navigate with a short timeoutMs lands on the partial page instead of failing', async () => {
        const result = await adapter.navigateTo(UrlFactory.unsafe(server.baseUrl), { timeoutMs: 500 });
        expect(result.isOk()).toBe(true);
        const readiness = result._unsafeUnwrap();
        expect(readiness.loadComplete).toBe(false);
        expect(adapter.getCurrentUrl()).toContain(server.baseUrl);
    }, 15_000);

    it('waitForReady with a generous timeout reports full readiness once the slow resource lands', async () => {
        const readiness = await adapter.waitForReady(SLOW_RESOURCE_DELAY_MS + 2_000);
        expect(readiness.loadComplete).toBe(true);
        expect(readiness.waitedMs).toBeGreaterThan(0);
    }, 15_000);

    it('navigate with a generous timeoutMs reports loadComplete', async () => {
        const result = await adapter.navigateTo(UrlFactory.unsafe(server.baseUrl), { timeoutMs: SLOW_RESOURCE_DELAY_MS + 5_000 });
        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap().loadComplete).toBe(true);
    }, 15_000);

    it('click honours a raised timeoutMs for elements that appear late', async () => {
        await adapter.navigateTo(UrlFactory.unsafe(server.baseUrl), { timeoutMs: 500 });
        adapter.updateRefs({ e1: { role: 'button', name: 'Late' } });

        const tooShort = await adapter.click('e1', { timeoutMs: 100, force: true });
        expect(tooShort.isErr()).toBe(true);

        const patient = await adapter.click('e1', { timeoutMs: LATE_BUTTON_DELAY_MS + 3_000 });
        expect(patient.isOk()).toBe(true);
    }, 20_000);
});
