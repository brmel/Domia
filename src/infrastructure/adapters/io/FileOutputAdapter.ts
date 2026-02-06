import { injectable } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { promises as fs } from 'fs';
import path from 'path';
import type { IOutputPort, TestOutput, TestResponse, OutputFile } from '@domain/ports';
import type { TestRunId } from '@domain/value-objects';
import { OutputError } from '@domain/errors';

/**
 * FileOutputAdapter
 * Implements IOutputPort for file-based output (JSON reports)
 */
@injectable()
export class FileOutputAdapter implements IOutputPort {
    private readonly outputDir: string;

    constructor() {
        this.outputDir = path.join(process.cwd(), 'output');
    }

    format(runId: TestRunId, response: TestResponse, file: OutputFile | null): TestOutput {
        return {
            id: runId,
            response,
            file,
        };
    }

    save(output: TestOutput): ResultAsync<void, OutputError> {
        return ResultAsync.fromPromise(
            this.doSave(output),
            (e) => new OutputError(`Failed to save output: ${String(e)}`)
        );
    }

    private async doSave(output: TestOutput): Promise<void> {
        await fs.mkdir(this.outputDir, { recursive: true });

        const filePath = path.join(this.outputDir, `${output.id}.json`);
        const content = JSON.stringify(
            {
                id: output.id,
                success: output.response.success,
                summary: output.response.summary,
                stepsCompleted: output.response.stepsCompleted,
                duration: output.response.duration,
                error: output.response.error,
                artifactPath: output.file?.path ?? null,
                artifactType: output.file?.type ?? null,
                timestamp: new Date().toISOString(),
            },
            null,
            2
        );

        await fs.writeFile(filePath, content, 'utf-8');
    }
}
