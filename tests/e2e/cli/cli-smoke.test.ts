import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { runCLICommand } from './helpers/cli-test-helpers';

/**
 * Deterministic CLI coverage — no LLM, no browser. Exercises the boot path
 * (electron-as-node + tsx + DI container) that regressed before (the __dirname
 * ESM crash, the DI 'Cannot inject IPersistenceAdapter' break). The live,
 * LLM-driven CLI scenarios stay separate under run-cli-tests.ts.
 */
describe('CLI smoke (deterministic, no LLM)', () => {
    it('prints help and registers every root command', async () => {
        const { stdout, exitCode } = await runCLICommand(['--help']);
        expect(exitCode).toBe(0);
        for (const cmd of ['run', 'history', 'workflow', 'settings', 'inspect', 'plugins', 'skills', 'shell']) {
            expect(stdout).toContain(cmd);
        }
    }, 90000);

    it('boots the DI container + persistence for `history list` without an API key', async () => {
        const { exitCode } = await runCLICommand(['history', 'list'], { GOOGLE_API_KEY: '', GEMINI_API_KEY: '' });
        expect(exitCode).toBe(0);
    }, 90000);
});
