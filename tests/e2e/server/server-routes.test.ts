import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'vitest';
import { registerCoreServices } from '@backend/container-root';
import { handleDomiaRequest } from '@apps/server/routes';

/**
 * The clean-boundary test: apps/server resolves the same backend services from
 * the same container as cli + desktop, with zero backend changes. If this boots
 * and serves, a third entry point is a pure add.
 */
describe('apps/server routes', () => {
    beforeAll(() => {
        registerCoreServices();
    });

    it('serves health from the bootstrapped container', async () => {
        const res = await handleDomiaRequest('/health');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ ok: true, app: 'Domia' });
    });

    it('resolves RunQueries for /runs', async () => {
        const res = await handleDomiaRequest('/runs');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('resolves WorkflowQueries for /workflows', async () => {
        const res = await handleDomiaRequest('/workflows');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('404s unknown paths', async () => {
        const res = await handleDomiaRequest('/nope');
        expect(res.status).toBe(404);
    });
});
