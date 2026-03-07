import 'reflect-metadata';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database as SqlJsDatabase } from 'sql.js';
import { SQLiteRunRepository } from '@infrastructure/persistence/SQLiteRunRepository';
import { ReportWriterService } from '@infrastructure/reporting/ReportWriterService';
import { JUnitXmlReportGenerator } from '@infrastructure/reporting/JUnitXmlReportGenerator';
import { HtmlReportGenerator } from '@infrastructure/reporting/HtmlReportGenerator';
import { Run } from '@domain/entities/Run';
import { RunIdFactory, UrlFactory } from '@domain/value-objects';
import { ActionType } from '@domain/enums/ActionType';
import { createInMemoryDb } from '../../../helpers/createInMemoryTestDb';

describe('ReportWriterService integration', () => {
    let repo: SQLiteRunRepository;
    let tmpDir: string;
    let raw: SqlJsDatabase;

    beforeEach(async () => {
        const result = await createInMemoryDb();
        raw = result.raw;
        repo = new SQLiteRunRepository(result.db);
        tmpDir = mkdtempSync(join(tmpdir(), 'domia-report-'));
    });

    afterEach(() => {
        raw.close();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    async function seedRun(): Promise<string> {
        const runId = RunIdFactory.create();
        const run = Run.create({ id: runId, url: UrlFactory.unsafe('https://example.com'), prompt: 'Integration test' });
        await repo.saveRun(run);

        const started = Run.start(run);
        await repo.updateRun(runId, { status: started.status, ...(started.startedAt && { startedAt: started.startedAt }) });

        const passed = Run.pass(started, 'Everything passed');
        await repo.updateRun(runId, { status: passed.status });

        await repo.saveStep({
            id: 'step-1',
            runId,
            stepNumber: 1,
            actionType: ActionType.CLICK,
            actionPayload: { type: 'click', thought: 'clicking button' } as never,
            timestamp: new Date().toISOString(),
        });

        return runId;
    }

    it('writes JUnit XML report to disk', async () => {
        const runId = await seedRun();
        const writer = new ReportWriterService(repo, [new JUnitXmlReportGenerator()]);

        const files = await writer.write(runId, ['junit'], tmpDir);

        expect(files).toHaveLength(1);
        expect(files[0]).toContain('.xml');
        expect(existsSync(files[0]!)).toBe(true);

        const content = readFileSync(files[0]!, 'utf-8');
        expect(content).toContain('<?xml version="1.0"');
        expect(content).toContain('Integration test');
        expect(content).toContain('Step 1: click');
    });

    it('writes HTML report to disk', async () => {
        const runId = await seedRun();
        const writer = new ReportWriterService(repo, [new HtmlReportGenerator()]);

        const files = await writer.write(runId, ['html'], tmpDir);

        expect(files).toHaveLength(1);
        expect(files[0]).toContain('.html');

        const content = readFileSync(files[0]!, 'utf-8');
        expect(content).toContain('<!DOCTYPE html>');
        expect(content).toContain('Integration test');
    });

    it('writes multiple formats at once', async () => {
        const runId = await seedRun();
        const writer = new ReportWriterService(repo, [new JUnitXmlReportGenerator(), new HtmlReportGenerator()]);

        const files = await writer.write(runId, ['junit', 'html'], tmpDir);

        expect(files).toHaveLength(2);
        expect(files.some(f => f.endsWith('.xml'))).toBe(true);
        expect(files.some(f => f.endsWith('.html'))).toBe(true);
    });

    it('throws for unknown run ID', async () => {
        const writer = new ReportWriterService(repo, [new JUnitXmlReportGenerator()]);
        await expect(writer.write('nonexistent', ['junit'], tmpDir)).rejects.toThrow('not found');
    });

    it('throws for unknown format', async () => {
        const runId = await seedRun();
        const writer = new ReportWriterService(repo, [new JUnitXmlReportGenerator()]);
        await expect(writer.write(runId, ['csv'], tmpDir)).rejects.toThrow('Unknown report format');
    });
});
