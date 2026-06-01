import 'reflect-metadata';
import { describe, it, expect, beforeAll } from 'vitest';
import { registerCoreServices } from '@backend/container-root';
import { appRouter } from '@apps/desktop/ipc/router';

/**
 * Exercises the real IPC path: tRPC procedure -> container.resolve -> backend
 * service -> SQLite. The smoke test only checks router shape; this invokes the
 * read procedures end-to-end through createCaller on the bootstrapped container.
 */
describe('IPC caller (read procedures, end-to-end)', () => {
    let caller: ReturnType<typeof appRouter.createCaller>;

    beforeAll(() => {
        registerCoreServices();
        caller = appRouter.createCaller({});
    });

    it('history.getRuns returns an array', async () => {
        const runs = await caller.history.getRuns();
        expect(Array.isArray(runs)).toBe(true);
    });

    it('plugins.list returns an array', async () => {
        const plugins = await caller.plugins.list();
        expect(Array.isArray(plugins)).toBe(true);
    });

    it('settings.get returns the config object', async () => {
        const settings = await caller.settings.get();
        expect(settings).toBeTypeOf('object');
        expect(settings).not.toBeNull();
    });

    it('workflow.getDefinitions returns an array', async () => {
        const defs = await caller.workflow.getDefinitions();
        expect(Array.isArray(defs)).toBe(true);
    });
});
