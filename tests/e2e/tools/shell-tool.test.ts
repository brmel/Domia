import 'reflect-metadata';
import { describe, expect, it, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { ShellExecutor } from '@infrastructure/shell/ShellExecutor';
import { createShellTools } from '@infrastructure/tools/catalog/shell.tools';

describe('Shell tool integration', () => {
    const executor = new ShellExecutor();
    const tools = createShellTools(executor);
    const shellExec = tools.find(t => t.name === 'shell_exec')!;

    const tmpDir = path.join(os.tmpdir(), `domia-shell-test-${Date.now()}`);

    afterEach(async () => {
        await fs.remove(tmpDir);
    });

    it('executes a real command and creates a file on disk', async () => {
        await fs.ensureDir(tmpDir);
        const filePath = path.join(tmpDir, 'canary.txt');

        const result = await shellExec.execute({
            command: `echo "DOMIA_SHELL_INTEGRATION_2026" > "${filePath}"`,
        });

        expect(result['status']).toBe('success');
        expect(result['exitCode']).toBe(0);

        const exists = await fs.pathExists(filePath);
        expect(exists).toBe(true);

        const content = await fs.readFile(filePath, 'utf-8');
        expect(content.trim()).toBe('DOMIA_SHELL_INTEGRATION_2026');
    });

    it('captures stdout from a real command', async () => {
        const result = await shellExec.execute({ command: 'echo hello-from-shell' });

        expect(result['status']).toBe('success');
        expect(result['exitCode']).toBe(0);
        expect((result['stdout'] as { content: string }).content).toContain('hello-from-shell');
    });

    it('reports non-zero exit code for failing commands', async () => {
        const result = await shellExec.execute({ command: 'exit 42' });

        expect(result['status']).toBe('error');
        expect(result['exitCode']).not.toBe(0);
    });

    it('respects cwd parameter', async () => {
        await fs.ensureDir(tmpDir);

        const result = await shellExec.execute({
            command: 'pwd',
            cwd: tmpDir,
        });

        expect(result['status']).toBe('success');
        const realTmpDir = await fs.realpath(tmpDir);
        expect((result['stdout'] as { content: string }).content.trim()).toBe(realTmpDir);
    });

    it('handles multi-step file operations', async () => {
        await fs.ensureDir(tmpDir);
        const srcFile = path.join(tmpDir, 'source.txt');
        const dstFile = path.join(tmpDir, 'destination.txt');

        await shellExec.execute({
            command: `echo "original content" > "${srcFile}"`,
        });
        await shellExec.execute({
            command: `cp "${srcFile}" "${dstFile}"`,
        });
        const appendResult = await shellExec.execute({
            command: `echo "appended line" >> "${dstFile}"`,
        });

        expect(appendResult['status']).toBe('success');

        const content = await fs.readFile(dstFile, 'utf-8');
        expect(content).toContain('original content');
        expect(content).toContain('appended line');
    });

    it('captures stderr on error', async () => {
        const result = await shellExec.execute({
            command: 'ls /nonexistent-path-domia-test',
        });

        expect(result['exitCode']).not.toBe(0);
        expect((result['stderr'] as { content: string }).content.length).toBeGreaterThan(0);
    });

    it('respects timeout and terminates long-running commands', async () => {
        const result = await shellExec.execute({
            command: 'sleep 60',
            timeoutMs: 500,
        });

        expect(result['exitCode']).not.toBe(0);
    });
});
