import { injectable } from 'tsyringe';
import { ResultAsync } from 'neverthrow';
import { promises as fs } from 'fs';
import path from 'path';
import type { IArtifactStorage } from '@domain/ports';
import type { TestRunId, ArtifactPath } from '@domain/value-objects';
import { StorageError } from '@domain/errors';
import { ArtifactPathFactory } from '@domain/value-objects';

/**
 * FileSystemAdapter
 * Implements IArtifactStorage port using Node.js fs
 */
@injectable()
export class FileSystemAdapter implements IArtifactStorage {
    private readonly baseDir: string;

    constructor() {
        this.baseDir = path.join(process.cwd(), 'artifacts');
    }

    saveScreenshot(runId: TestRunId, step: number, data: Buffer): ResultAsync<ArtifactPath, StorageError> {
        const filePath = path.join(this.baseDir, runId, `step-${step}.png`);
        return this.writeFile(filePath, data);
    }

    saveVideo(runId: TestRunId, data: Buffer): ResultAsync<ArtifactPath, StorageError> {
        const filePath = path.join(this.baseDir, runId, 'recording.webm');
        return this.writeFile(filePath, data);
    }

    saveTrace(runId: TestRunId, data: Buffer): ResultAsync<ArtifactPath, StorageError> {
        const filePath = path.join(this.baseDir, runId, 'trace.zip');
        return this.writeFile(filePath, data);
    }

    delete(artifactPath: ArtifactPath): ResultAsync<void, StorageError> {
        return ResultAsync.fromPromise(
            fs.unlink(artifactPath),
            (e) => new StorageError(`Failed to delete artifact: ${String(e)}`)
        );
    }

    private writeFile(filePath: string, data: Buffer): ResultAsync<ArtifactPath, StorageError> {
        return ResultAsync.fromPromise(
            this.doWriteFile(filePath, data),
            (e) => new StorageError(`Failed to write file: ${String(e)}`)
        ).map(() => ArtifactPathFactory.create(filePath));
    }

    private async doWriteFile(filePath: string, data: Buffer): Promise<void> {
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, data);
    }
}
