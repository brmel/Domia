import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { appRouter } from '@apps/desktop/ipc/router';

/**
 * Desktop IPC wiring smoke. The tRPC appRouter is the desktop's entire surface;
 * this catches a feature router being dropped or renamed. Structural only — the
 * procedures resolve from the container at call time, exercised through the
 * shared backend services elsewhere.
 */
describe('IPC appRouter wiring', () => {
    it('exposes every feature router namespace', () => {
        const def = (appRouter as unknown as { _def: { record?: Record<string, unknown>; procedures?: Record<string, unknown> } })._def;
        const keys = Object.keys(def.record ?? def.procedures ?? {});
        for (const ns of ['run', 'history', 'workflow', 'settings', 'prompts', 'plugins', 'skills']) {
            expect(keys.some((k) => k === ns || k.startsWith(`${ns}.`))).toBe(true);
        }
    });
});
