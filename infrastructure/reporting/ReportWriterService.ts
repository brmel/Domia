import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IReportGenerator, RunReport } from '@domain/ports/reporting/IReportGenerator';
import type { IRunRepository } from '@domain/ports/persistence/IRunRepository';

export class ReportWriterService {
    private readonly generators: Map<string, IReportGenerator>;

    constructor(
        private readonly runRepository: IRunRepository,
        generators: IReportGenerator[],
    ) {
        this.generators = new Map(generators.map(g => [g.format, g]));
    }

    async write(runId: string, formats: string[], outputDir: string): Promise<string[]> {
        const runResult = await this.runRepository.getRun(runId);
        if (runResult.isErr()) throw new Error(`Failed to load run: ${runResult.error.message}`);
        const run = runResult.value;
        if (!run) throw new Error(`Run '${runId}' not found`);

        const stepsResult = await this.runRepository.getSteps(runId);
        if (stepsResult.isErr()) throw new Error(`Failed to load steps: ${stepsResult.error.message}`);

        const report: RunReport = { run, steps: stepsResult.value };
        mkdirSync(outputDir, { recursive: true });

        const written: string[] = [];
        for (const fmt of formats) {
            const generator = this.generators.get(fmt);
            if (!generator) throw new Error(`Unknown report format: '${fmt}'`);

            const content = generator.generate(report);
            const ext = fmt === 'junit' ? 'xml' : fmt;
            const filePath = join(outputDir, `${runId}.${ext}`);
            writeFileSync(filePath, content, 'utf-8');
            written.push(filePath);
        }
        return written;
    }
}
